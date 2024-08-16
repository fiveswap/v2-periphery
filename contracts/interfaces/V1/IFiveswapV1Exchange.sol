pragma solidity >=0.5.0;

interface IFiveswapV1Exchange {
    function balanceOf(address owner) external view returns (uint);
    function transferFrom(address from, address to, uint value) external returns (bool);
    function removeLiquidity(uint, uint, uint, uint) external returns (uint, uint);
    function tokenToPENSwapInput(uint, uint, uint) external returns (uint);
    function PENToTokenSwapInput(uint, uint) external payable returns (uint);
}
