import chai, { expect } from 'chai'
import { Contract } from 'ethers'
import { AddressZero, MaxUint256 } from 'ethers/constants'
import { bigNumberify } from 'ethers/utils'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { v2Fixture } from './shared/fixtures'
import { expandTo18Decimals, MINIMUM_LIQUIDITY } from './shared/utilities'

chai.use(solidity)

const overrides = {
  gasLimit: 9999999
}

describe('FiveswapV2Migrator', () => {
  const provider = new MockProvider({
    hardfork: 'istanbul',
    mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
    gasLimit: 9999999
  })
  const [wallet] = provider.getWallets()
  const loadFixture = createFixtureLoader(provider, [wallet])

  let WPENPartner: Contract
  let WPENPair: Contract
  let router: Contract
  let migrator: Contract
  let WPENExchangeV1: Contract
  beforeEach(async function() {
    const fixture = await loadFixture(v2Fixture)
    WPENPartner = fixture.WPENPartner
    WPENPair = fixture.WPENPair
    router = fixture.router01 // we used router01 for this contract
    migrator = fixture.migrator
    WPENExchangeV1 = fixture.WPENExchangeV1
  })

  it('migrate', async () => {
    const WPENPartnerAmount = expandTo18Decimals(1)
    const PENAmount = expandTo18Decimals(4)
    await WPENPartner.approve(WPENExchangeV1.address, MaxUint256)
    await WPENExchangeV1.addLiquidity(bigNumberify(1), WPENPartnerAmount, MaxUint256, {
      ...overrides,
      value: PENAmount
    })
    await WPENExchangeV1.approve(migrator.address, MaxUint256)
    const expectedLiquidity = expandTo18Decimals(2)
    const WPENPairToken0 = await WPENPair.token0()
    await expect(
      migrator.migrate(WPENPartner.address, WPENPartnerAmount, PENAmount, wallet.address, MaxUint256, overrides)
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
})
