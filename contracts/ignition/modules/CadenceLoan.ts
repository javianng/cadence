import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("CadenceLoanModule", (m) => {
  const adminAddress = m.getParameter("adminAddress", m.getAccount(0));
  const baseURI = m.getParameter(
    "baseURI",
    "http://localhost:3000/api/metadata",
  );

  const cadenceLoan = m.contract("CadenceLoan", [adminAddress, baseURI]);

  return { cadenceLoan };
});
