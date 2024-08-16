pragma solidity =0.6.6;

import 'https://github.com/fiveswap/v2-core/blob/main/contracts/interfaces/IFiveswapV2Factory.sol';
import 'https://github.com/fiveswap/v2-core/blob/main/contracts/libraries/TransferHelper.sol';

import './interfaces/IFiveswapV2Router02.sol';
import './libraries/FiveswapV2Library.sol';
import './libraries/SafeMath.sol';
import './interfaces/IERC20.sol';
import './interfaces/IWPEN.sol';

contract FiveswapV2Router02 is IFiveswapV2Router02 {
    using SafeMath for uint;

    address public immutable override factory;
    address public immutable override WPEN;

    modifier ensure(uint deadline) {
        require(deadline >= block.timestamp, 'FiveswapV2Router: EXPIRED');
        _;
    }

    constructor(address _factory, address _WPEN) public {
        factory = _factory;
        WPEN = _WPEN;
    }

    receive() external payable {
        assert(msg.sender == WPEN); // only accept PEN via fallback from the WPEN contract
    }

    // **** ADD LIQUIDITY ****
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin
    ) internal virtual returns (uint amountA, uint amountB) {
        // create the pair if it doesn't exist yet
        if (IFiveswapV2Factory(factory).getPair(tokenA, tokenB) == address(0)) {
            IFiveswapV2Factory(factory).createPair(tokenA, tokenB);
        }
        (uint reserveA, uint reserveB) = FiveswapV2Library.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint amountBOptimal = FiveswapV2Library.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, 'FiveswapV2Router: INSUFFICIENT_B_AMOUNT');
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint amountAOptimal = FiveswapV2Library.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, 'FiveswapV2Router: INSUFFICIENT_A_AMOUNT');
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint amountA, uint amountB, uint liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = FiveswapV2Library.pairFor(factory, tokenA, tokenB);
        TransferHelper.safeTransferFrom(tokenA, msg.sender, pair, amountA);
        TransferHelper.safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IFiveswapV2Pair(pair).mint(to);
    }
    function addLiquidityPEN(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountPENMin,
        address to,
        uint deadline
    ) external virtual override payable ensure(deadline) returns (uint amountToken, uint amountPEN, uint liquidity) {
        (amountToken, amountPEN) = _addLiquidity(
            token,
            WPEN,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountPENMin
        );
        address pair = FiveswapV2Library.pairFor(factory, token, WPEN);
        TransferHelper.safeTransferFrom(token, msg.sender, pair, amountToken);
        IWPEN(WPEN).deposit{value: amountPEN}();
        assert(IWPEN(WPEN).transfer(pair, amountPEN));
        liquidity = IFiveswapV2Pair(pair).mint(to);
        // refund dust PEN, if any
        if (msg.value > amountPEN) TransferHelper.safeTransferPEN(msg.sender, msg.value - amountPEN);
    }

    // **** REMOVE LIQUIDITY ****
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountA, uint amountB) {
        address pair = FiveswapV2Library.pairFor(factory, tokenA, tokenB);
        IFiveswapV2Pair(pair).transferFrom(msg.sender, pair, liquidity); // send liquidity to pair
        (uint amount0, uint amount1) = IFiveswapV2Pair(pair).burn(to);
        (address token0,) = FiveswapV2Library.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, 'FiveswapV2Router: INSUFFICIENT_A_AMOUNT');
        require(amountB >= amountBMin, 'FiveswapV2Router: INSUFFICIENT_B_AMOUNT');
    }
    function removeLiquidityPEN(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountPENMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountToken, uint amountPEN) {
        (amountToken, amountPEN) = removeLiquidity(
            token,
            WPEN,
            liquidity,
            amountTokenMin,
            amountPENMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, amountToken);
        IWPEN(WPEN).withdraw(amountPEN);
        TransferHelper.safeTransferPEN(to, amountPEN);
    }
    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountA, uint amountB) {
        address pair = FiveswapV2Library.pairFor(factory, tokenA, tokenB);
        uint value = approveMax ? uint(-1) : liquidity;
        IFiveswapV2Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountA, amountB) = removeLiquidity(tokenA, tokenB, liquidity, amountAMin, amountBMin, to, deadline);
    }
    function removeLiquidityPENWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountPENMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountToken, uint amountPEN) {
        address pair = FiveswapV2Library.pairFor(factory, token, WPEN);
        uint value = approveMax ? uint(-1) : liquidity;
        IFiveswapV2Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        (amountToken, amountPEN) = removeLiquidityPEN(token, liquidity, amountTokenMin, amountPENMin, to, deadline);
    }

    // **** REMOVE LIQUIDITY (supporting fee-on-transfer tokens) ****
    function removeLiquidityPENSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountPENMin,
        address to,
        uint deadline
    ) public virtual override ensure(deadline) returns (uint amountPEN) {
        (, amountPEN) = removeLiquidity(
            token,
            WPEN,
            liquidity,
            amountTokenMin,
            amountPENMin,
            address(this),
            deadline
        );
        TransferHelper.safeTransfer(token, to, IERC20(token).balanceOf(address(this)));
        IWPEN(WPEN).withdraw(amountPEN);
        TransferHelper.safeTransferPEN(to, amountPEN);
    }
    function removeLiquidityPENWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountPENMin,
        address to,
        uint deadline,
        bool approveMax, uint8 v, bytes32 r, bytes32 s
    ) external virtual override returns (uint amountPEN) {
        address pair = FiveswapV2Library.pairFor(factory, token, WPEN);
        uint value = approveMax ? uint(-1) : liquidity;
        IFiveswapV2Pair(pair).permit(msg.sender, address(this), value, deadline, v, r, s);
        amountPEN = removeLiquidityPENSupportingFeeOnTransferTokens(
            token, liquidity, amountTokenMin, amountPENMin, to, deadline
        );
    }

    // **** SWAP ****
    // requires the initial amount to have already been sent to the first pair
    function _swap(uint[] memory amounts, address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = FiveswapV2Library.sortTokens(input, output);
            uint amountOut = amounts[i + 1];
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
            address to = i < path.length - 2 ? FiveswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            IFiveswapV2Pair(FiveswapV2Library.pairFor(factory, input, output)).swap(
                amount0Out, amount1Out, to, new bytes(0)
            );
        }
    }
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        amounts = FiveswapV2Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'FiveswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, FiveswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) returns (uint[] memory amounts) {
        amounts = FiveswapV2Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'FiveswapV2Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, FiveswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, to);
    }
    function swapExactPENForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WPEN, 'FiveswapV2Router: INVALID_PATH');
        amounts = FiveswapV2Library.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'FiveswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IWPEN(WPEN).deposit{value: amounts[0]}();
        assert(IWPEN(WPEN).transfer(FiveswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }
    function swapTokensForExactPEN(uint amountOut, uint amountInMax, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == WPEN, 'FiveswapV2Router: INVALID_PATH');
        amounts = FiveswapV2Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, 'FiveswapV2Router: EXCESSIVE_INPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, FiveswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWPEN(WPEN).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferPEN(to, amounts[amounts.length - 1]);
    }
    function swapExactTokensForPEN(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[path.length - 1] == WPEN, 'FiveswapV2Router: INVALID_PATH');
        amounts = FiveswapV2Library.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, 'FiveswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, FiveswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]
        );
        _swap(amounts, path, address(this));
        IWPEN(WPEN).withdraw(amounts[amounts.length - 1]);
        TransferHelper.safeTransferPEN(to, amounts[amounts.length - 1]);
    }
    function swapPENForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline)
        external
        virtual
        override
        payable
        ensure(deadline)
        returns (uint[] memory amounts)
    {
        require(path[0] == WPEN, 'FiveswapV2Router: INVALID_PATH');
        amounts = FiveswapV2Library.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, 'FiveswapV2Router: EXCESSIVE_INPUT_AMOUNT');
        IWPEN(WPEN).deposit{value: amounts[0]}();
        assert(IWPEN(WPEN).transfer(FiveswapV2Library.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        // refund dust PEN, if any
        if (msg.value > amounts[0]) TransferHelper.safeTransferPEN(msg.sender, msg.value - amounts[0]);
    }

    // **** SWAP (supporting fee-on-transfer tokens) ****
    // requires the initial amount to have already been sent to the first pair
    function _swapSupportingFeeOnTransferTokens(address[] memory path, address _to) internal virtual {
        for (uint i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = FiveswapV2Library.sortTokens(input, output);
            IFiveswapV2Pair pair = IFiveswapV2Pair(FiveswapV2Library.pairFor(factory, input, output));
            uint amountInput;
            uint amountOutput;
            { // scope to avoid stack too deep errors
            (uint reserve0, uint reserve1,) = pair.getReserves();
            (uint reserveInput, uint reserveOutput) = input == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            amountInput = IERC20(input).balanceOf(address(pair)).sub(reserveInput);
            amountOutput = FiveswapV2Library.getAmountOut(amountInput, reserveInput, reserveOutput);
            }
            (uint amount0Out, uint amount1Out) = input == token0 ? (uint(0), amountOutput) : (amountOutput, uint(0));
            address to = i < path.length - 2 ? FiveswapV2Library.pairFor(factory, output, path[i + 2]) : _to;
            pair.swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }
    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override ensure(deadline) {
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, FiveswapV2Library.pairFor(factory, path[0], path[1]), amountIn
        );
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'FiveswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactPENForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        payable
        ensure(deadline)
    {
        require(path[0] == WPEN, 'FiveswapV2Router: INVALID_PATH');
        uint amountIn = msg.value;
        IWPEN(WPEN).deposit{value: amountIn}();
        assert(IWPEN(WPEN).transfer(FiveswapV2Library.pairFor(factory, path[0], path[1]), amountIn));
        uint balanceBefore = IERC20(path[path.length - 1]).balanceOf(to);
        _swapSupportingFeeOnTransferTokens(path, to);
        require(
            IERC20(path[path.length - 1]).balanceOf(to).sub(balanceBefore) >= amountOutMin,
            'FiveswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT'
        );
    }
    function swapExactTokensForPENSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    )
        external
        virtual
        override
        ensure(deadline)
    {
        require(path[path.length - 1] == WPEN, 'FiveswapV2Router: INVALID_PATH');
        TransferHelper.safeTransferFrom(
            path[0], msg.sender, FiveswapV2Library.pairFor(factory, path[0], path[1]), amountIn
        );
        _swapSupportingFeeOnTransferTokens(path, address(this));
        uint amountOut = IERC20(WPEN).balanceOf(address(this));
        require(amountOut >= amountOutMin, 'FiveswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT');
        IWPEN(WPEN).withdraw(amountOut);
        TransferHelper.safeTransferPEN(to, amountOut);
    }

    // **** LIBRARY FUNCTIONS ****
    function quote(uint amountA, uint reserveA, uint reserveB) public pure virtual override returns (uint amountB) {
        return FiveswapV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountOut)
    {
        return FiveswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut)
        public
        pure
        virtual
        override
        returns (uint amountIn)
    {
        return FiveswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(uint amountIn, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return FiveswapV2Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint amountOut, address[] memory path)
        public
        view
        virtual
        override
        returns (uint[] memory amounts)
    {
        return FiveswapV2Library.getAmountsIn(factory, amountOut, path);
    }
}
