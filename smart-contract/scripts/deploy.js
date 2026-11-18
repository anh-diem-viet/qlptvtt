const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const NETWORK_LABELS = { localhost: 'Hardhat Local', ganache: 'Ganache Local' };

async function main() {
  const contract = await hre.ethers.deployContract('RentalManager');
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const { chainId } = await hre.ethers.provider.getNetwork();
  const network = hre.network.name;
  console.log(`RentalManager deployed tại ${address} trên ${network} (chainId ${chainId})`);

  // Ghi địa chỉ + ABI + RPC cho frontend (gọi contract), backend (đồng bộ sự kiện) và script Web3.py
  const artifact = await hre.artifacts.readArtifact('RentalManager');
  const json = JSON.stringify(
    {
      address,
      chainId: Number(chainId),
      network,
      networkLabel: NETWORK_LABELS[network] || network,
      rpcUrl: hre.network.config.url || 'http://127.0.0.1:8545',
      abi: artifact.abi,
    },
    null,
    2,
  );
  for (const dir of [['frontend', 'src', 'contracts'], ['backend', 'src', 'contracts'], ['web3py', 'contracts']]) {
    const outDir = path.join(__dirname, '..', '..', ...dir);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'RentalManager.json'), json);
    console.log(`Đã ghi ${path.relative(process.cwd(), path.join(outDir, 'RentalManager.json'))}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
