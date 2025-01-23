const hre = require("hardhat");


async function main() {

  const [addr1] = await hre.ethers.getSigners();
  const routerContract = await ethers.getContractFactory("FiveswapV2Router01");
  this.routerContract = await routerContract.connect(addr1).deploy("0x519E7722d5d0ceE1773357C6A752c7Bb7f12bBf3","0xBF84c848159C262354922A1b1f460Ebe7f991073");

  console.log("FiveswapV2Router01 deployed to:", this.routerContract.target);
  await new Promise(r => setTimeout(r, 60000));

  try {
    await hre.run("verify:verify", {
      address: this.routerContract.target,
      constructorArguments: [
        "0x519E7722d5d0ceE1773357C6A752c7Bb7f12bBf3",
        "0xBF84c848159C262354922A1b1f460Ebe7f991073",
      ],
    });
  } catch (err) {
    console.log(err)
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
