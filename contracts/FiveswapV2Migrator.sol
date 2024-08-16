pragma solidity =0.6.6;

import 'https://github.com/fiveswap/v2-core/blob/main/contracts/libraries/TransferHelper.sol';

import './interfaces/IFiveswapV2Migrator.sol';
import './interfaces/V1/IFiveswapV1Factory.sol';
import './interfaces/V1/IFiveswapV1Exchange.sol';
import './interfaces/IFiveswapV2Router01.sol';
import './interfaces/IERC20.sol';

contract FiveswapV2Migrator is IFiveswapV2Migrator {
    IFiveswapV1Factory immutable factoryV1;
    IFiveswapV2Router01 immutable router;

    constructor(address _factoryV1, address _router) public {
        factoryV1 = IFiveswapV1Factory(_factoryV1);
        router = IFiveswapV2Router01(_router);
    }

    // needs to accept PEN from any v1 exchange and the router. ideally this could be enforced, as in the router,
    // but it's not possible because it requires a call to the v1 factory, which takes too much gas
    receive() external payable {}

    function migrate(address token, uint amountTokenMin, uint amountPENMin, address to, uint deadline)
        external
        override
    {
        IFiveswapV1Exchange exchangeV1 = IFiveswapV1Exchange(factoryV1.getExchange(token));
        uint liquidityV1 = exchangeV1.balanceOf(msg.sender);
        require(exchangeV1.transferFrom(msg.sender, address(this), liquidityV1), 'TRANSFER_FROM_FAILED');
        (uint amountPENV1, uint amountTokenV1) = exchangeV1.removeLiquidity(liquidityV1, 1, 1, uint(-1));
        TransferHelper.safeApprove(token, address(router), amountTokenV1);
        (uint amountTokenV2, uint amountPENV2,) = router.addLiquidityPEN{value: amountPENV1}(
            token,
            amountTokenV1,
            amountTokenMin,
            amountPENMin,
            to,
            deadline
        );
        if (amountTokenV1 > amountTokenV2) {
            TransferHelper.safeApprove(token, address(router), 0); // be a good blockchain citizen, reset allowance to 0
            TransferHelper.safeTransfer(token, msg.sender, amountTokenV1 - amountTokenV2);
        } else if (amountPENV1 > amountPENV2) {
            // addLiquidityPEN guarantees that all of amountPENV1 or amountTokenV1 will be used, hence this else is safe
            TransferHelper.safeTransferPEN(msg.sender, amountPENV1 - amountPENV2);
        }
    }
}
