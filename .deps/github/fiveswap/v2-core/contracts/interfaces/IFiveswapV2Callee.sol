pragma solidity >=0.5.0;

interface IFiveswapV2Callee {
    function FiveswapV2Call(address sender, uint amount0, uint amount1, bytes calldata data) external;
}
