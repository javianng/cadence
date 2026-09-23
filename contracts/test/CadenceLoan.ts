import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const BASE_URI = "http://localhost:3000/api/metadata";

// Standard loan: 250bps base, 175–325 corridor, 25bps max step per period.
const BASE = 250;
const FLOOR = 175;
const CAP = 325;
const MAX_STEP = 25;
const BANDS = [
  { minScore: 80, adjustmentBps: -50 },
  { minScore: 60, adjustmentBps: -25 },
  { minScore: 40, adjustmentBps: 0 },
  { minScore: 0, adjustmentBps: 50 },
];

const BORROWER_REF = ethers.id("borrower:demo-001");
const DATA_HASH = ethers.id("data:period-1");
const RUN_REF = ethers.id("run:period-1");
const RM_REF = ethers.id("rm:alice");
const REASON = ethers.encodeBytes32String("DATA_MISMATCH");

async function deployFixture() {
  const [admin, borrower, oracle, rm, stranger] = await ethers.getSigners();
  const cadence = await ethers.deployContract("CadenceLoan", [
    admin.address,
    BASE_URI,
  ]);
  await cadence.grantRole(await cadence.ORACLE_ROLE(), oracle.address);
  await cadence.grantRole(await cadence.RM_ROLE(), rm.address);
  await cadence.mintLoan(
    borrower.address,
    BORROWER_REF,
    BASE,
    FLOOR,
    CAP,
    MAX_STEP,
    BANDS,
  );
  return { cadence, admin, borrower, oracle, rm, stranger, tokenId: 0n };
}

describe("CadenceLoan", function () {
  describe("mintLoan", function () {
    it("stores the initial state and emits LoanMinted", async function () {
      const [admin, borrower] = await ethers.getSigners();
      const cadence = await ethers.deployContract("CadenceLoan", [
        admin.address,
        BASE_URI,
      ]);

      await expect(
        cadence.mintLoan(
          borrower.address,
          BORROWER_REF,
          BASE,
          FLOOR,
          CAP,
          MAX_STEP,
          BANDS,
        ),
      )
        .to.emit(cadence, "LoanMinted")
        .withArgs(0n, BORROWER_REF, BASE);

      const loan = await cadence.getLoan(0n);
      expect(loan.borrowerRef).to.equal(BORROWER_REF);
      expect(loan.baseMarginBps).to.equal(BASE);
      expect(loan.currentMarginBps).to.equal(BASE);
      expect(loan.floorBps).to.equal(FLOOR);
      expect(loan.capBps).to.equal(CAP);
      expect(loan.maxStepBps).to.equal(MAX_STEP);
      expect(loan.currentScore).to.equal(0n);
      expect(loan.pendingAdjustmentBps).to.equal(0n);
      expect(loan.updateCount).to.equal(0n);

      const bands = await cadence.getBands(0n);
      expect(bands.map((b) => [Number(b.minScore), Number(b.adjustmentBps)])).to.deep.equal(
        BANDS.map((b) => [b.minScore, b.adjustmentBps]),
      );

      expect(await cadence.ownerOf(0n)).to.equal(borrower.address);
      expect(await cadence.nextTokenId()).to.equal(1n);
      expect(await cadence.tokenURI(0n)).to.equal(`${BASE_URI}/0`);
    });

    it("reverts if bands are not sorted descending by minScore", async function () {
      const { cadence, borrower } = await networkHelpers.loadFixture(deployFixture);
      const unsorted = [
        { minScore: 60, adjustmentBps: -25 },
        { minScore: 80, adjustmentBps: -50 },
        { minScore: 0, adjustmentBps: 50 },
      ];
      await expect(
        cadence.mintLoan(borrower.address, BORROWER_REF, BASE, FLOOR, CAP, MAX_STEP, unsorted),
      ).to.be.revertedWithCustomError(cadence, "BandsNotSorted");

      const duplicate = [
        { minScore: 60, adjustmentBps: -25 },
        { minScore: 60, adjustmentBps: -50 },
        { minScore: 0, adjustmentBps: 50 },
      ];
      await expect(
        cadence.mintLoan(borrower.address, BORROWER_REF, BASE, FLOOR, CAP, MAX_STEP, duplicate),
      ).to.be.revertedWithCustomError(cadence, "BandsNotSorted");
    });

    it("reverts on empty bands, no zero band, or base outside floor/cap", async function () {
      const { cadence, borrower } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        cadence.mintLoan(borrower.address, BORROWER_REF, BASE, FLOOR, CAP, MAX_STEP, []),
      ).to.be.revertedWithCustomError(cadence, "InvalidBands");
      await expect(
        cadence.mintLoan(borrower.address, BORROWER_REF, BASE, FLOOR, CAP, MAX_STEP, [
          { minScore: 50, adjustmentBps: 0 },
        ]),
      ).to.be.revertedWithCustomError(cadence, "InvalidBands");
      await expect(
        cadence.mintLoan(borrower.address, BORROWER_REF, 400, FLOOR, CAP, MAX_STEP, BANDS),
      ).to.be.revertedWithCustomError(cadence, "InvalidLoanParams");
    });

    it("only DEFAULT_ADMIN_ROLE can mint", async function () {
      const { cadence, borrower, stranger } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        cadence
          .connect(stranger)
          .mintLoan(borrower.address, BORROWER_REF, BASE, FLOOR, CAP, MAX_STEP, BANDS),
      ).to.be.revertedWithCustomError(cadence, "AccessControlUnauthorizedAccount");
    });
  });

  describe("submitScore", function () {
    it("applies a decrease immediately and emits ScoreSubmitted + MarginUpdated", async function () {
      const { cadence, oracle, tokenId } = await networkHelpers.loadFixture(deployFixture);
      const ts = (await networkHelpers.time.latest()) + 100;
      await networkHelpers.time.setNextBlockTimestamp(ts);

      // score 65 -> band 60 (-25) -> target 225, delta -25 (within max step)
      const tx = cadence.connect(oracle).submitScore(tokenId, 65, DATA_HASH, RUN_REF);
      await expect(tx)
        .to.emit(cadence, "ScoreSubmitted")
        .withArgs(tokenId, 65, DATA_HASH, RUN_REF, ts);
      await expect(tx).to.emit(cadence, "MarginUpdated").withArgs(tokenId, 250, 225, 65);
      await expect(tx).to.not.emit(cadence, "AdjustmentPending");

      const loan = await cadence.getLoan(tokenId);
      expect(loan.currentMarginBps).to.equal(225n);
      expect(loan.pendingAdjustmentBps).to.equal(0n);
      expect(loan.currentScore).to.equal(65n);
      expect(loan.updateCount).to.equal(1n);
      expect(loan.lastUpdated).to.equal(BigInt(ts));
    });

    it("holds an increase as pending without changing currentMarginBps", async function () {
      const { cadence, oracle, tokenId } = await networkHelpers.loadFixture(deployFixture);

      // score 20 -> band 0 (+50) -> target 300, step capped to +25
      const tx = cadence.connect(oracle).submitScore(tokenId, 20, DATA_HASH, RUN_REF);
      await expect(tx).to.emit(cadence, "AdjustmentPending").withArgs(tokenId, 25);
      await expect(tx).to.emit(cadence, "ScoreSubmitted");
      await expect(tx).to.not.emit(cadence, "MarginUpdated");

      const loan = await cadence.getLoan(tokenId);
      expect(loan.currentMarginBps).to.equal(250n);
      expect(loan.pendingAdjustmentBps).to.equal(25n);
      expect(loan.currentScore).to.equal(20n);
      expect(loan.updateCount).to.equal(1n);
    });

    it("caps the step at maxStepBps even when the target is further away", async function () {
      const { cadence, oracle, tokenId } = await networkHelpers.loadFixture(deployFixture);

      // score 90 -> band 80 (-50) -> target 200, but step capped at -25
      await expect(cadence.connect(oracle).submitScore(tokenId, 90, DATA_HASH, RUN_REF))
        .to.emit(cadence, "MarginUpdated")
        .withArgs(tokenId, 250, 225, 90);
      // next period reaches the target
      await expect(cadence.connect(oracle).submitScore(tokenId, 90, DATA_HASH, RUN_REF))
        .to.emit(cadence, "MarginUpdated")
        .withArgs(tokenId, 225, 200, 90);
      // already at target -> zero step, still recorded as an update
      await expect(cadence.connect(oracle).submitScore(tokenId, 90, DATA_HASH, RUN_REF))
        .to.emit(cadence, "MarginUpdated")
        .withArgs(tokenId, 200, 200, 90);
      expect((await cadence.getLoan(tokenId)).updateCount).to.equal(3n);
    });

    it("a later decrease clears a stale pending increase", async function () {
      const { cadence, oracle, tokenId } = await networkHelpers.loadFixture(deployFixture);
      await cadence.connect(oracle).submitScore(tokenId, 20, DATA_HASH, RUN_REF);
      expect((await cadence.getLoan(tokenId)).pendingAdjustmentBps).to.equal(25n);

      await cadence.connect(oracle).submitScore(tokenId, 85, DATA_HASH, RUN_REF);
      const loan = await cadence.getLoan(tokenId);
      expect(loan.pendingAdjustmentBps).to.equal(0n);
      expect(loan.currentMarginBps).to.equal(225n);
    });

    it("never moves currentMarginBps outside floor/cap across many submissions", async function () {
      const [admin, borrower] = await ethers.getSigners();
      const cadence = await ethers.deployContract("CadenceLoan", [admin.address, BASE_URI]);
      // Bands far wider than the corridor, big max step, to push on both bounds.
      await cadence.mintLoan(borrower.address, BORROWER_REF, BASE, FLOOR, CAP, 100, [
        { minScore: 50, adjustmentBps: -500 },
        { minScore: 0, adjustmentBps: 500 },
      ]);

      const scores = [99, 99, 99, 0, 0, 0, 0, 99, 0, 0, 99, 99];
      for (const score of scores) {
        await cadence.submitScore(0n, score, DATA_HASH, RUN_REF);
        if ((await cadence.getLoan(0n)).pendingAdjustmentBps !== 0n) {
          await cadence.resolveAdjustment(0n, true, RM_REF);
        }
        const margin = (await cadence.getLoan(0n)).currentMarginBps;
        expect(margin).to.be.gte(BigInt(FLOOR));
        expect(margin).to.be.lte(BigInt(CAP));
      }

      // Confirm both bounds were actually reached.
      await cadence.submitScore(0n, 99, DATA_HASH, RUN_REF);
      await cadence.submitScore(0n, 99, DATA_HASH, RUN_REF);
      expect((await cadence.getLoan(0n)).currentMarginBps).to.equal(BigInt(FLOOR));
      for (let i = 0; i < 2; i++) {
        await cadence.submitScore(0n, 0, DATA_HASH, RUN_REF);
        await cadence.resolveAdjustment(0n, true, RM_REF);
      }
      expect((await cadence.getLoan(0n)).currentMarginBps).to.equal(BigInt(CAP));
      // At the cap, a low score yields a zero step: nothing pending.
      await cadence.submitScore(0n, 0, DATA_HASH, RUN_REF);
      expect((await cadence.getLoan(0n)).pendingAdjustmentBps).to.equal(0n);
    });

    it("reverts for a nonexistent loan", async function () {
      const { cadence, oracle } = await networkHelpers.loadFixture(deployFixture);
      await expect(cadence.connect(oracle).submitScore(99n, 50, DATA_HASH, RUN_REF))
        .to.be.revertedWithCustomError(cadence, "LoanNotFound")
        .withArgs(99n);
    });
  });

  describe("resolveAdjustment", function () {
    it("approve applies the pending change and clears it", async function () {
      const { cadence, oracle, rm, tokenId } = await networkHelpers.loadFixture(deployFixture);
      await cadence.connect(oracle).submitScore(tokenId, 20, DATA_HASH, RUN_REF);

      await expect(cadence.connect(rm).resolveAdjustment(tokenId, true, RM_REF))
        .to.emit(cadence, "AdjustmentResolved")
        .withArgs(tokenId, true, RM_REF, 275);

      const loan = await cadence.getLoan(tokenId);
      expect(loan.currentMarginBps).to.equal(275n);
      expect(loan.pendingAdjustmentBps).to.equal(0n);
    });

    it("reject discards the pending change and clears it", async function () {
      const { cadence, oracle, rm, tokenId } = await networkHelpers.loadFixture(deployFixture);
      await cadence.connect(oracle).submitScore(tokenId, 20, DATA_HASH, RUN_REF);

      await expect(cadence.connect(rm).resolveAdjustment(tokenId, false, RM_REF))
        .to.emit(cadence, "AdjustmentResolved")
        .withArgs(tokenId, false, RM_REF, 250);

      const loan = await cadence.getLoan(tokenId);
      expect(loan.currentMarginBps).to.equal(250n);
      expect(loan.pendingAdjustmentBps).to.equal(0n);
    });

    it("reverts if nothing is pending", async function () {
      const { cadence, rm, tokenId } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        cadence.connect(rm).resolveAdjustment(tokenId, true, RM_REF),
      ).to.be.revertedWithCustomError(cadence, "NothingPending");
    });
  });

  describe("flagException", function () {
    it("emits ExceptionFlagged without changing state", async function () {
      const { cadence, oracle, tokenId } = await networkHelpers.loadFixture(deployFixture);
      const before = await cadence.getLoan(tokenId);
      await expect(cadence.connect(oracle).flagException(tokenId, REASON, DATA_HASH))
        .to.emit(cadence, "ExceptionFlagged")
        .withArgs(tokenId, REASON, DATA_HASH);
      expect(await cadence.getLoan(tokenId)).to.deep.equal(before);
    });
  });

  describe("access control", function () {
    it("only ORACLE_ROLE can call submitScore and flagException", async function () {
      const { cadence, rm, stranger, borrower, tokenId } =
        await networkHelpers.loadFixture(deployFixture);
      const role = await cadence.ORACLE_ROLE();
      for (const signer of [rm, stranger, borrower]) {
        await expect(cadence.connect(signer).submitScore(tokenId, 50, DATA_HASH, RUN_REF))
          .to.be.revertedWithCustomError(cadence, "AccessControlUnauthorizedAccount")
          .withArgs(signer.address, role);
        await expect(cadence.connect(signer).flagException(tokenId, REASON, DATA_HASH))
          .to.be.revertedWithCustomError(cadence, "AccessControlUnauthorizedAccount")
          .withArgs(signer.address, role);
      }
    });

    it("only RM_ROLE can call resolveAdjustment", async function () {
      const { cadence, oracle, stranger, borrower, tokenId } =
        await networkHelpers.loadFixture(deployFixture);
      await cadence.connect(oracle).submitScore(tokenId, 20, DATA_HASH, RUN_REF);
      const role = await cadence.RM_ROLE();
      for (const signer of [oracle, stranger, borrower]) {
        await expect(cadence.connect(signer).resolveAdjustment(tokenId, true, RM_REF))
          .to.be.revertedWithCustomError(cadence, "AccessControlUnauthorizedAccount")
          .withArgs(signer.address, role);
      }
    });

    it("constructor grants all three roles to admin", async function () {
      const { cadence, admin } = await networkHelpers.loadFixture(deployFixture);
      expect(await cadence.hasRole(await cadence.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await cadence.hasRole(await cadence.ORACLE_ROLE(), admin.address)).to.equal(true);
      expect(await cadence.hasRole(await cadence.RM_ROLE(), admin.address)).to.equal(true);
    });
  });

  describe("soulbound", function () {
    it("reverts on transferFrom and safeTransferFrom after mint", async function () {
      const { cadence, borrower, stranger, tokenId } =
        await networkHelpers.loadFixture(deployFixture);
      await expect(
        cadence.connect(borrower).transferFrom(borrower.address, stranger.address, tokenId),
      ).to.be.revertedWithCustomError(cadence, "Soulbound");
      await expect(
        cadence
          .connect(borrower)
          ["safeTransferFrom(address,address,uint256)"](borrower.address, stranger.address, tokenId),
      ).to.be.revertedWithCustomError(cadence, "Soulbound");
      expect(await cadence.ownerOf(tokenId)).to.equal(borrower.address);
    });
  });

  describe("previewMargin", function () {
    it("matches what submitScore applies for a decrease, without writing state", async function () {
      const { cadence, oracle, tokenId } = await networkHelpers.loadFixture(deployFixture);
      const before = await cadence.getLoan(tokenId);

      const preview = await cadence.previewMargin(tokenId, 90);
      expect(preview).to.equal(225n);
      expect(await cadence.getLoan(tokenId)).to.deep.equal(before);

      await cadence.connect(oracle).submitScore(tokenId, 90, DATA_HASH, RUN_REF);
      expect((await cadence.getLoan(tokenId)).currentMarginBps).to.equal(preview);
    });

    it("matches the post-approval margin for an increase", async function () {
      const { cadence, oracle, rm, tokenId } = await networkHelpers.loadFixture(deployFixture);
      const preview = await cadence.previewMargin(tokenId, 20);
      expect(preview).to.equal(275n);

      await cadence.connect(oracle).submitScore(tokenId, 20, DATA_HASH, RUN_REF);
      await cadence.connect(rm).resolveAdjustment(tokenId, true, RM_REF);
      expect((await cadence.getLoan(tokenId)).currentMarginBps).to.equal(preview);
    });

    it("matches submitScore across a sequence of scores", async function () {
      const { cadence, oracle, rm, tokenId } = await networkHelpers.loadFixture(deployFixture);
      for (const score of [90, 90, 50, 10, 10, 70, 100, 0]) {
        const preview = await cadence.previewMargin(tokenId, score);
        await cadence.connect(oracle).submitScore(tokenId, score, DATA_HASH, RUN_REF);
        if ((await cadence.getLoan(tokenId)).pendingAdjustmentBps !== 0n) {
          await cadence.connect(rm).resolveAdjustment(tokenId, true, RM_REF);
        }
        expect((await cadence.getLoan(tokenId)).currentMarginBps).to.equal(preview);
      }
    });
  });
});
