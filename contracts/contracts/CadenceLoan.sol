// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title CadenceLoan
/// @notice Soulbound NFT per sustainability-linked loan. The margin reprices
///         continuously from oracle-submitted transition scores. Decreases
///         apply immediately; increases wait for RM approval.
contract CadenceLoan is ERC721, AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant RM_ROLE = keccak256("RM_ROLE");

    struct Band {
        uint8 minScore;
        int16 adjustmentBps;
    }

    struct Loan {
        bytes32 borrowerRef; // hash only, never PII
        uint16 baseMarginBps;
        uint16 currentMarginBps;
        uint16 floorBps;
        uint16 capBps;
        uint16 maxStepBps;
        uint8 currentScore;
        int16 pendingAdjustmentBps; // 0 if nothing pending
        uint32 updateCount;
        uint64 lastUpdated;
    }

    mapping(uint256 => Loan) public loans;
    mapping(uint256 => Band[]) public bands; // sorted descending by minScore
    uint256 public nextTokenId;
    string public baseURI;

    event LoanMinted(uint256 indexed tokenId, bytes32 borrowerRef, uint16 baseMarginBps);
    event ScoreSubmitted(uint256 indexed tokenId, uint8 score, bytes32 dataHash, bytes32 runRef, uint256 timestamp);
    event MarginUpdated(uint256 indexed tokenId, uint16 oldBps, uint16 newBps, uint8 score);
    event AdjustmentPending(uint256 indexed tokenId, int16 proposedBps);
    event AdjustmentResolved(uint256 indexed tokenId, bool approved, bytes32 rmRef, uint16 newBps);
    event ExceptionFlagged(uint256 indexed tokenId, bytes32 reasonCode, bytes32 dataHash);

    error Soulbound();
    error BandsNotSorted();
    error InvalidBands();
    error InvalidLoanParams();
    error NothingPending();
    error LoanNotFound(uint256 tokenId);

    constructor(address admin, string memory _baseURI) ERC721("Cadence Sustainability-Linked Loan", "CADENCE") {
        // Demo only: production would separate these roles across wallets.
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_ROLE, admin);
        _grantRole(RM_ROLE, admin);
        baseURI = _baseURI;
    }

    modifier loanExists(uint256 tokenId) {
        if (tokenId >= nextTokenId) revert LoanNotFound(tokenId);
        _;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function mintLoan(
        address to,
        bytes32 borrowerRef,
        uint16 baseMarginBps,
        uint16 floorBps,
        uint16 capBps,
        uint16 maxStepBps,
        Band[] calldata _bands
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 tokenId) {
        if (floorBps > baseMarginBps || baseMarginBps > capBps) revert InvalidLoanParams();
        uint256 n = _bands.length;
        // A final band at minScore 0 guarantees every score resolves to a band.
        if (n == 0 || _bands[n - 1].minScore != 0) revert InvalidBands();

        tokenId = nextTokenId++;
        Band[] storage stored = bands[tokenId];
        for (uint256 i = 0; i < n; i++) {
            if (i > 0 && _bands[i].minScore >= _bands[i - 1].minScore) revert BandsNotSorted();
            stored.push(_bands[i]);
        }

        loans[tokenId] = Loan({
            borrowerRef: borrowerRef,
            baseMarginBps: baseMarginBps,
            currentMarginBps: baseMarginBps,
            floorBps: floorBps,
            capBps: capBps,
            maxStepBps: maxStepBps,
            currentScore: 0,
            pendingAdjustmentBps: 0,
            updateCount: 0,
            lastUpdated: uint64(block.timestamp)
        });

        _safeMint(to, tokenId);
        emit LoanMinted(tokenId, borrowerRef, baseMarginBps);
    }

    // ---------------------------------------------------------------------
    // Oracle
    // ---------------------------------------------------------------------

    function submitScore(uint256 tokenId, uint8 score, bytes32 dataHash, bytes32 runRef)
        external
        onlyRole(ORACLE_ROLE)
        loanExists(tokenId)
    {
        Loan storage loan = loans[tokenId];
        int256 step = _computeStep(loan, bands[tokenId], score);

        loan.currentScore = score;
        loan.lastUpdated = uint64(block.timestamp);
        loan.updateCount++;
        emit ScoreSubmitted(tokenId, score, dataHash, runRef, block.timestamp);

        if (step <= 0) {
            uint16 oldBps = loan.currentMarginBps;
            uint16 newBps = uint16(uint256(int256(uint256(oldBps)) + step));
            loan.currentMarginBps = newBps;
            loan.pendingAdjustmentBps = 0;
            emit MarginUpdated(tokenId, oldBps, newBps, score);
        } else {
            loan.pendingAdjustmentBps = int16(step);
            emit AdjustmentPending(tokenId, int16(step));
        }
    }

    function flagException(uint256 tokenId, bytes32 reasonCode, bytes32 dataHash)
        external
        onlyRole(ORACLE_ROLE)
        loanExists(tokenId)
    {
        emit ExceptionFlagged(tokenId, reasonCode, dataHash);
    }

    // ---------------------------------------------------------------------
    // Relationship Manager
    // ---------------------------------------------------------------------

    function resolveAdjustment(uint256 tokenId, bool approve, bytes32 rmRef)
        external
        onlyRole(RM_ROLE)
        loanExists(tokenId)
    {
        Loan storage loan = loans[tokenId];
        int16 pending = loan.pendingAdjustmentBps;
        if (pending == 0) revert NothingPending();

        if (approve) {
            int256 next = int256(uint256(loan.currentMarginBps)) + pending;
            loan.currentMarginBps = uint16(uint256(_clamp(next, loan.floorBps, loan.capBps)));
        }
        loan.pendingAdjustmentBps = 0;
        emit AdjustmentResolved(tokenId, approve, rmRef, loan.currentMarginBps);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Margin that would result from `score` (for an increase, the
    ///         margin after RM approval). Does not write state.
    function previewMargin(uint256 tokenId, uint8 score) external view loanExists(tokenId) returns (uint16) {
        Loan storage loan = loans[tokenId];
        int256 step = _computeStep(loan, bands[tokenId], score);
        return uint16(uint256(int256(uint256(loan.currentMarginBps)) + step));
    }

    function getLoan(uint256 tokenId) external view loanExists(tokenId) returns (Loan memory) {
        return loans[tokenId];
    }

    function getBands(uint256 tokenId) external view loanExists(tokenId) returns (Band[] memory) {
        return bands[tokenId];
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(baseURI, "/", Strings.toString(tokenId));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev Soulbound: only mint (from == 0) and burn (to == 0) are allowed.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    /// @dev Band lookup -> clamped target -> step limited to ±maxStepBps.
    function _computeStep(Loan storage loan, Band[] storage loanBands, uint8 score) internal view returns (int256) {
        int256 adjustment;
        uint256 n = loanBands.length;
        for (uint256 i = 0; i < n; i++) {
            if (loanBands[i].minScore <= score) {
                adjustment = loanBands[i].adjustmentBps;
                break;
            }
        }

        int256 target = _clamp(int256(uint256(loan.baseMarginBps)) + adjustment, loan.floorBps, loan.capBps);
        int256 delta = target - int256(uint256(loan.currentMarginBps));
        int256 maxStep = int256(uint256(loan.maxStepBps));
        if (delta > maxStep) return maxStep;
        if (delta < -maxStep) return -maxStep;
        return delta;
    }

    function _clamp(int256 value, uint16 lo, uint16 hi) internal pure returns (int256) {
        if (value < int256(uint256(lo))) return int256(uint256(lo));
        if (value > int256(uint256(hi))) return int256(uint256(hi));
        return value;
    }
}
