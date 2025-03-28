const hre = require("hardhat");


async function main() {

  const [addr1] = await hre.ethers.getSigners();
  const helloworldContract = await ethers.getContractFactory("PentaswapV2Router02");
  this.helloworldContract = await helloworldContract.connect(addr1).deploy("0x9254B401E844478C5bF9A87D70F4b530F1c35d9B","0xBF84c848159C262354922A1b1f460Ebe7f991073");

  console.log("PentaswapV2Router02 deployed to:", this.helloworldContract.target);
  await new Promise(r => setTimeout(r, 60000));

  try {
    await hre.run("verify:verify", {
      address: this.helloworldContract.target,
      constructorArguments: [
        "0x7FeaEe5e47b9AF76F704eD3c41d41abc87F0c359",
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
