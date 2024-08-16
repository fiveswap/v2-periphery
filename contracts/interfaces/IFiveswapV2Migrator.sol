pragma solidity >=0.5.0;

interface IFiveswapV2Migrator {
    function migrate(address token, uint amountTokenMin, uint amountPENMin, address to, uint deadline) external;
}
