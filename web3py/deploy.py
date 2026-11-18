"""Deploy RentalManager bằng Web3.py (thay cho `npm run deploy:ganache`).

Dùng bytecode do Hardhat biên dịch (cd smart-contract && npx hardhat compile), deploy bằng tài khoản #0 của node,
rồi ghi địa chỉ + ABI + RPC cho frontend, backend và các script Web3.py — giống scripts/deploy.js.

    python deploy.py                                  # Ganache 7545
    python deploy.py --rpc http://127.0.0.1:8545      # Hardhat node
"""
import argparse
import json
import sys

from web3 import Web3

from rental import ARTIFACT_FILE, DEFAULT_RPC_URL, HERE

NETWORK_LABELS = {1337: ("ganache", "Ganache Local"), 31337: ("localhost", "Hardhat Local")}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--rpc", default=DEFAULT_RPC_URL, help=f"RPC URL (mặc định {DEFAULT_RPC_URL})")
    args = parser.parse_args()

    if not ARTIFACT_FILE.exists():
        sys.exit("Chưa có bytecode — chạy `npx hardhat compile` trong smart-contract/ trước.")
    artifact = json.loads(ARTIFACT_FILE.read_text(encoding="utf-8"))

    w3 = Web3(Web3.HTTPProvider(args.rpc))
    if not w3.is_connected():
        sys.exit(f"Không kết nối được node tại {args.rpc}")
    deployer = w3.eth.accounts[0]
    factory = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])
    tx_hash = factory.constructor().transact({"from": deployer})
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    address = receipt["contractAddress"]
    chain_id = w3.eth.chain_id
    network, label = NETWORK_LABELS.get(chain_id, (f"chain-{chain_id}", f"Chain {chain_id}"))
    print(f"RentalManager deployed tại {address} (chainId {chain_id}, block #{receipt['blockNumber']})")

    data = json.dumps(
        {
            "address": address,
            "chainId": chain_id,
            "network": network,
            "networkLabel": label,
            "rpcUrl": args.rpc,
            "abi": artifact["abi"],
        },
        indent=2,
        ensure_ascii=False,
    )
    root = HERE.parent
    for out_dir in (root / "frontend" / "src" / "contracts", root / "backend" / "src" / "contracts", HERE / "contracts"):
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "RentalManager.json").write_text(data, encoding="utf-8")
        print(f"Đã ghi {(out_dir / 'RentalManager.json').relative_to(root)}")


if __name__ == "__main__":
    main()
