pragma solidity >=0.5.0;

interface IPentaswapV2Migrator {
    function migrate(address token, uint amountTokenMin, uint amountPENMin, address to, uint deadline) external;
}
