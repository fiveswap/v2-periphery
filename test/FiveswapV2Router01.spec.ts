import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, Zero, MaxUint256 } from 'ethers/constants'
import { BigNumber, bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'
import { ecsign } from 'ethereumjs-util'

import { expandTo18Decimals, getApprovalDigest, mineBlock, MINIMUM_LIQUIDITY } from './shared/utilities'
import { v2Fixture } from './shared/fixtures'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

enum RouterVersion {
  FiveswapV2Router01 = 'FiveswapV2Router01',
  FiveswapV2Router02 = 'FiveswapV2Router02'
}

describe('FiveswapV2Router{01,02}', () => {
  for (const routerVersion of Object.keys(RouterVersion)) {
    const provider = new MockProvider({
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999
    })
    const [wallet] = provider.getWallets()
    const loadFixture = createFixtureLoader(provider, [wallet])

    let token0: Contract
    let token1: Contract
    let WPEN: Contract
    let WPENPartner: Contract
    let factory: Contract
    let router: Contract
    let pair: Contract
    let WPENPair: Contract
    let routerEventEmitter: Contract
    beforeEach(async function() {
      const fixture = await loadFixture(v2Fixture)
      token0 = fixture.token0
      token1 = fixture.token1
      WPEN = fixture.WPEN
      WPENPartner = fixture.WPENPartner
      factory = fixture.factoryV2
      router = {
        [RouterVersion.FiveswapV2Router01]: fixture.router01,
        [RouterVersion.FiveswapV2Router02]: fixture.router02
      }[routerVersion as RouterVersion]
      pair = fixture.pair
      WPENPair = fixture.WPENPair
      routerEventEmitter = fixture.routerEventEmitter
    })

    afterEach(async function() {
      expect(await provider.getBalance(router.address)).to.eq(Zero)
    })

    describe(routerVersion, () => {
      it('factory, WPEN', async () => {
        expect(await router.factory()).to.eq(factory.address)
        expect(await router.WPEN()).to.eq(WPEN.address)
      })

      it('addLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        await token0.approve(router.address, MaxUint256)
        await token1.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidity(
            token0.address,
            token1.address,
            token0Amount,
            token1Amount,
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(token0, 'Transfer')
          .withArgs(wallet.address, pair.address, token0Amount)
          .to.emit(token1, 'Transfer')
          .withArgs(wallet.address, pair.address, token1Amount)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(pair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Sync')
          .withArgs(token0Amount, token1Amount)
          .to.emit(pair, 'Mint')
          .withArgs(router.address, token0Amount, token1Amount)

        expect(await pair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      it('addLiquidityPEN', async () => {
        const WPENPartnerAmount = expandTo18Decimals(1)
        const PENAmount = expandTo18Decimals(4)

        const expectedLiquidity = expandTo18Decimals(2)
        const WPENPairToken0 = await WPENPair.token0()
        await WPENPartner.approve(router.address, MaxUint256)
        await expect(
          router.addLiquidityPEN(
            WPENPartner.address,
            WPENPartnerAmount,
            WPENPartnerAmount,
            PENAmount,
            wallet.address,
            MaxUint256,
            { ...overrides, value: PENAmount }
          )
        )
          .to.emit(WPENPair, 'Transfer')
          .withArgs(AddressZero, AddressZero, MINIMUM_LIQUIDITY)
          .to.emit(WPENPair, 'Transfer')
          .withArgs(AddressZero, wallet.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WPENPair, 'Sync')
          .withArgs(
            WPENPairToken0 === WPENPartner.address ? WPENPartnerAmount : PENAmount,
            WPENPairToken0 === WPENPartner.address ? PENAmount : WPENPartnerAmount
          )
          .to.emit(WPENPair, 'Mint')
          .withArgs(
            router.address,
            WPENPairToken0 === WPENPartner.address ? WPENPartnerAmount : PENAmount,
            WPENPairToken0 === WPENPartner.address ? PENAmount : WPENPartnerAmount
          )

        expect(await WPENPair.balanceOf(wallet.address)).to.eq(expectedLiquidity.sub(MINIMUM_LIQUIDITY))
      })

      async function addLiquidity(token0Amount: BigNumber, token1Amount: BigNumber) {
        await token0.transfer(pair.address, token0Amount)
        await token1.transfer(pair.address, token1Amount)
        await pair.mint(wallet.address, overrides)
      }
      it('removeLiquidity', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)
        await pair.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidity(
            token0.address,
            token1.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(pair, 'Transfer')
          .withArgs(wallet.address, pair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(pair, 'Transfer')
          .withArgs(pair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(token0, 'Transfer')
          .withArgs(pair.address, wallet.address, token0Amount.sub(500))
          .to.emit(token1, 'Transfer')
          .withArgs(pair.address, wallet.address, token1Amount.sub(2000))
          .to.emit(pair, 'Sync')
          .withArgs(500, 2000)
          .to.emit(pair, 'Burn')
          .withArgs(router.address, token0Amount.sub(500), token1Amount.sub(2000), wallet.address)

        expect(await pair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyToken0 = await token0.totalSupply()
        const totalSupplyToken1 = await token1.totalSupply()
        expect(await token0.balanceOf(wallet.address)).to.eq(totalSupplyToken0.sub(500))
        expect(await token1.balanceOf(wallet.address)).to.eq(totalSupplyToken1.sub(2000))
      })

      it('removeLiquidityPEN', async () => {
        const WPENPartnerAmount = expandTo18Decimals(1)
        const PENAmount = expandTo18Decimals(4)
        await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
        await WPEN.deposit({ value: PENAmount })
        await WPEN.transfer(WPENPair.address, PENAmount)
        await WPENPair.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(2)
        const WPENPairToken0 = await WPENPair.token0()
        await WPENPair.approve(router.address, MaxUint256)
        await expect(
          router.removeLiquidityPEN(
            WPENPartner.address,
            expectedLiquidity.sub(MINIMUM_LIQUIDITY),
            0,
            0,
            wallet.address,
            MaxUint256,
            overrides
          )
        )
          .to.emit(WPENPair, 'Transfer')
          .withArgs(wallet.address, WPENPair.address, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WPENPair, 'Transfer')
          .withArgs(WPENPair.address, AddressZero, expectedLiquidity.sub(MINIMUM_LIQUIDITY))
          .to.emit(WPEN, 'Transfer')
          .withArgs(WPENPair.address, router.address, PENAmount.sub(2000))
          .to.emit(WPENPartner, 'Transfer')
          .withArgs(WPENPair.address, router.address, WPENPartnerAmount.sub(500))
          .to.emit(WPENPartner, 'Transfer')
          .withArgs(router.address, wallet.address, WPENPartnerAmount.sub(500))
          .to.emit(WPENPair, 'Sync')
          .withArgs(
            WPENPairToken0 === WPENPartner.address ? 500 : 2000,
            WPENPairToken0 === WPENPartner.address ? 2000 : 500
          )
          .to.emit(WPENPair, 'Burn')
          .withArgs(
            router.address,
            WPENPairToken0 === WPENPartner.address ? WPENPartnerAmount.sub(500) : PENAmount.sub(2000),
            WPENPairToken0 === WPENPartner.address ? PENAmount.sub(2000) : WPENPartnerAmount.sub(500),
            router.address
          )

        expect(await WPENPair.balanceOf(wallet.address)).to.eq(0)
        const totalSupplyWPENPartner = await WPENPartner.totalSupply()
        const totalSupplyWPEN = await WPEN.totalSupply()
        expect(await WPENPartner.balanceOf(wallet.address)).to.eq(totalSupplyWPENPartner.sub(500))
        expect(await WPEN.balanceOf(wallet.address)).to.eq(totalSupplyWPEN.sub(2000))
      })

      it('removeLiquidityWithPermit', async () => {
        const token0Amount = expandTo18Decimals(1)
        const token1Amount = expandTo18Decimals(4)
        await addLiquidity(token0Amount, token1Amount)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await pair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          pair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityWithPermit(
          token0.address,
          token1.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      it('removeLiquidityPENWithPermit', async () => {
        const WPENPartnerAmount = expandTo18Decimals(1)
        const PENAmount = expandTo18Decimals(4)
        await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
        await WPEN.deposit({ value: PENAmount })
        await WPEN.transfer(WPENPair.address, PENAmount)
        await WPENPair.mint(wallet.address, overrides)

        const expectedLiquidity = expandTo18Decimals(2)

        const nonce = await WPENPair.nonces(wallet.address)
        const digest = await getApprovalDigest(
          WPENPair,
          { owner: wallet.address, spender: router.address, value: expectedLiquidity.sub(MINIMUM_LIQUIDITY) },
          nonce,
          MaxUint256
        )

        const { v, r, s } = ecsign(Buffer.from(digest.slice(2), 'hex'), Buffer.from(wallet.privateKey.slice(2), 'hex'))

        await router.removeLiquidityPENWithPermit(
          WPENPartner.address,
          expectedLiquidity.sub(MINIMUM_LIQUIDITY),
          0,
          0,
          wallet.address,
          MaxUint256,
          false,
          v,
          r,
          s,
          overrides
        )
      })

      describe('swapExactTokensForTokens', () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await addLiquidity(token0Amount, token1Amount)
          await token0.approve(router.address, MaxUint256)
        })

        it('happy path', async () => {
          await expect(
            router.swapExactTokensForTokens(
              swapAmount,
              0,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(wallet.address, pair.address, swapAmount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, wallet.address, expectedOutputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(swapAmount), token1Amount.sub(expectedOutputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(router.address, swapAmount, 0, 0, expectedOutputAmount, wallet.address)
        })

        it('amounts', async () => {
          await token0.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapExactTokensForTokens(
              router.address,
              swapAmount,
              0,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })

        it('gas', async () => {
          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await pair.sync(overrides)

          await token0.approve(router.address, MaxUint256)
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router.swapExactTokensForTokens(
            swapAmount,
            0,
            [token0.address, token1.address],
            wallet.address,
            MaxUint256,
            overrides
          )
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(
            {
              [RouterVersion.FiveswapV2Router01]: 101876,
              [RouterVersion.FiveswapV2Router02]: 101898
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactTokens', () => {
        const token0Amount = expandTo18Decimals(5)
        const token1Amount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await addLiquidity(token0Amount, token1Amount)
        })

        it('happy path', async () => {
          await token0.approve(router.address, MaxUint256)
          await expect(
            router.swapTokensForExactTokens(
              outputAmount,
              MaxUint256,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(token0, 'Transfer')
            .withArgs(wallet.address, pair.address, expectedSwapAmount)
            .to.emit(token1, 'Transfer')
            .withArgs(pair.address, wallet.address, outputAmount)
            .to.emit(pair, 'Sync')
            .withArgs(token0Amount.add(expectedSwapAmount), token1Amount.sub(outputAmount))
            .to.emit(pair, 'Swap')
            .withArgs(router.address, expectedSwapAmount, 0, 0, outputAmount, wallet.address)
        })

        it('amounts', async () => {
          await token0.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapTokensForExactTokens(
              router.address,
              outputAmount,
              MaxUint256,
              [token0.address, token1.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })

      describe('swapExactPENForTokens', () => {
        const WPENPartnerAmount = expandTo18Decimals(10)
        const PENAmount = expandTo18Decimals(5)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
          await WPEN.deposit({ value: PENAmount })
          await WPEN.transfer(WPENPair.address, PENAmount)
          await WPENPair.mint(wallet.address, overrides)

          await token0.approve(router.address, MaxUint256)
        })

        it('happy path', async () => {
          const WPENPairToken0 = await WPENPair.token0()
          await expect(
            router.swapExactPENForTokens(0, [WPEN.address, WPENPartner.address], wallet.address, MaxUint256, {
              ...overrides,
              value: swapAmount
            })
          )
            .to.emit(WPEN, 'Transfer')
            .withArgs(router.address, WPENPair.address, swapAmount)
            .to.emit(WPENPartner, 'Transfer')
            .withArgs(WPENPair.address, wallet.address, expectedOutputAmount)
            .to.emit(WPENPair, 'Sync')
            .withArgs(
              WPENPairToken0 === WPENPartner.address
                ? WPENPartnerAmount.sub(expectedOutputAmount)
                : PENAmount.add(swapAmount),
              WPENPairToken0 === WPENPartner.address
                ? PENAmount.add(swapAmount)
                : WPENPartnerAmount.sub(expectedOutputAmount)
            )
            .to.emit(WPENPair, 'Swap')
            .withArgs(
              router.address,
              WPENPairToken0 === WPENPartner.address ? 0 : swapAmount,
              WPENPairToken0 === WPENPartner.address ? swapAmount : 0,
              WPENPairToken0 === WPENPartner.address ? expectedOutputAmount : 0,
              WPENPairToken0 === WPENPartner.address ? 0 : expectedOutputAmount,
              wallet.address
            )
        })

        it('amounts', async () => {
          await expect(
            routerEventEmitter.swapExactPENForTokens(
              router.address,
              0,
              [WPEN.address, WPENPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: swapAmount
              }
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })

        it('gas', async () => {
          const WPENPartnerAmount = expandTo18Decimals(10)
          const PENAmount = expandTo18Decimals(5)
          await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
          await WPEN.deposit({ value: PENAmount })
          await WPEN.transfer(WPENPair.address, PENAmount)
          await WPENPair.mint(wallet.address, overrides)

          // ensure that setting price{0,1}CumulativeLast for the first time doesn't affect our gas math
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          await pair.sync(overrides)

          const swapAmount = expandTo18Decimals(1)
          await mineBlock(provider, (await provider.getBlock('latest')).timestamp + 1)
          const tx = await router.swapExactPENForTokens(
            0,
            [WPEN.address, WPENPartner.address],
            wallet.address,
            MaxUint256,
            {
              ...overrides,
              value: swapAmount
            }
          )
          const receipt = await tx.wait()
          expect(receipt.gasUsed).to.eq(
            {
              [RouterVersion.FiveswapV2Router01]: 138770,
              [RouterVersion.FiveswapV2Router02]: 138770
            }[routerVersion as RouterVersion]
          )
        }).retries(3)
      })

      describe('swapTokensForExactPEN', () => {
        const WPENPartnerAmount = expandTo18Decimals(5)
        const PENAmount = expandTo18Decimals(10)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
          await WPEN.deposit({ value: PENAmount })
          await WPEN.transfer(WPENPair.address, PENAmount)
          await WPENPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          await WPENPartner.approve(router.address, MaxUint256)
          const WPENPairToken0 = await WPENPair.token0()
          await expect(
            router.swapTokensForExactPEN(
              outputAmount,
              MaxUint256,
              [WPENPartner.address, WPEN.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(WPENPartner, 'Transfer')
            .withArgs(wallet.address, WPENPair.address, expectedSwapAmount)
            .to.emit(WPEN, 'Transfer')
            .withArgs(WPENPair.address, router.address, outputAmount)
            .to.emit(WPENPair, 'Sync')
            .withArgs(
              WPENPairToken0 === WPENPartner.address
                ? WPENPartnerAmount.add(expectedSwapAmount)
                : PENAmount.sub(outputAmount),
              WPENPairToken0 === WPENPartner.address
                ? PENAmount.sub(outputAmount)
                : WPENPartnerAmount.add(expectedSwapAmount)
            )
            .to.emit(WPENPair, 'Swap')
            .withArgs(
              router.address,
              WPENPairToken0 === WPENPartner.address ? expectedSwapAmount : 0,
              WPENPairToken0 === WPENPartner.address ? 0 : expectedSwapAmount,
              WPENPairToken0 === WPENPartner.address ? 0 : outputAmount,
              WPENPairToken0 === WPENPartner.address ? outputAmount : 0,
              router.address
            )
        })

        it('amounts', async () => {
          await WPENPartner.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapTokensForExactPEN(
              router.address,
              outputAmount,
              MaxUint256,
              [WPENPartner.address, WPEN.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })

      describe('swapExactTokensForPEN', () => {
        const WPENPartnerAmount = expandTo18Decimals(5)
        const PENAmount = expandTo18Decimals(10)
        const swapAmount = expandTo18Decimals(1)
        const expectedOutputAmount = bigNumberify('1662497915624478906')

        beforeEach(async () => {
          await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
          await WPEN.deposit({ value: PENAmount })
          await WPEN.transfer(WPENPair.address, PENAmount)
          await WPENPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          await WPENPartner.approve(router.address, MaxUint256)
          const WPENPairToken0 = await WPENPair.token0()
          await expect(
            router.swapExactTokensForPEN(
              swapAmount,
              0,
              [WPENPartner.address, WPEN.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(WPENPartner, 'Transfer')
            .withArgs(wallet.address, WPENPair.address, swapAmount)
            .to.emit(WPEN, 'Transfer')
            .withArgs(WPENPair.address, router.address, expectedOutputAmount)
            .to.emit(WPENPair, 'Sync')
            .withArgs(
              WPENPairToken0 === WPENPartner.address
                ? WPENPartnerAmount.add(swapAmount)
                : PENAmount.sub(expectedOutputAmount),
              WPENPairToken0 === WPENPartner.address
                ? PENAmount.sub(expectedOutputAmount)
                : WPENPartnerAmount.add(swapAmount)
            )
            .to.emit(WPENPair, 'Swap')
            .withArgs(
              router.address,
              WPENPairToken0 === WPENPartner.address ? swapAmount : 0,
              WPENPairToken0 === WPENPartner.address ? 0 : swapAmount,
              WPENPairToken0 === WPENPartner.address ? 0 : expectedOutputAmount,
              WPENPairToken0 === WPENPartner.address ? expectedOutputAmount : 0,
              router.address
            )
        })

        it('amounts', async () => {
          await WPENPartner.approve(routerEventEmitter.address, MaxUint256)
          await expect(
            routerEventEmitter.swapExactTokensForPEN(
              router.address,
              swapAmount,
              0,
              [WPENPartner.address, WPEN.address],
              wallet.address,
              MaxUint256,
              overrides
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([swapAmount, expectedOutputAmount])
        })
      })

      describe('swapPENForExactTokens', () => {
        const WPENPartnerAmount = expandTo18Decimals(10)
        const PENAmount = expandTo18Decimals(5)
        const expectedSwapAmount = bigNumberify('557227237267357629')
        const outputAmount = expandTo18Decimals(1)

        beforeEach(async () => {
          await WPENPartner.transfer(WPENPair.address, WPENPartnerAmount)
          await WPEN.deposit({ value: PENAmount })
          await WPEN.transfer(WPENPair.address, PENAmount)
          await WPENPair.mint(wallet.address, overrides)
        })

        it('happy path', async () => {
          const WPENPairToken0 = await WPENPair.token0()
          await expect(
            router.swapPENForExactTokens(
              outputAmount,
              [WPEN.address, WPENPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: expectedSwapAmount
              }
            )
          )
            .to.emit(WPEN, 'Transfer')
            .withArgs(router.address, WPENPair.address, expectedSwapAmount)
            .to.emit(WPENPartner, 'Transfer')
            .withArgs(WPENPair.address, wallet.address, outputAmount)
            .to.emit(WPENPair, 'Sync')
            .withArgs(
              WPENPairToken0 === WPENPartner.address
                ? WPENPartnerAmount.sub(outputAmount)
                : PENAmount.add(expectedSwapAmount),
              WPENPairToken0 === WPENPartner.address
                ? PENAmount.add(expectedSwapAmount)
                : WPENPartnerAmount.sub(outputAmount)
            )
            .to.emit(WPENPair, 'Swap')
            .withArgs(
              router.address,
              WPENPairToken0 === WPENPartner.address ? 0 : expectedSwapAmount,
              WPENPairToken0 === WPENPartner.address ? expectedSwapAmount : 0,
              WPENPairToken0 === WPENPartner.address ? outputAmount : 0,
              WPENPairToken0 === WPENPartner.address ? 0 : outputAmount,
              wallet.address
            )
        })

        it('amounts', async () => {
          await expect(
            routerEventEmitter.swapPENForExactTokens(
              router.address,
              outputAmount,
              [WPEN.address, WPENPartner.address],
              wallet.address,
              MaxUint256,
              {
                ...overrides,
                value: expectedSwapAmount
              }
            )
          )
            .to.emit(routerEventEmitter, 'Amounts')
            .withArgs([expectedSwapAmount, outputAmount])
        })
      })
    })
  }
})
