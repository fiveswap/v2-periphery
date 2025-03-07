import { Wallet, Contract } from 'ethers'
import { Web3Provider } from 'ethers/providers'
import { deployContract } from 'ethereum-waffle'

import { expandTo18Decimals } from './utilities'

import PentaswapV2Factory from '@Pentaswap/v2-core/build/PentaswapV2Factory.json'
import IPentaswapV2Pair from '@Pentaswap/v2-core/build/IPentaswapV2Pair.json'

import ERC20 from '../../build/ERC20.json'
import WPEN9 from '../../build/WPEN9.json'
import PentaswapV1Exchange from '../../build/PentaswapV1Exchange.json'
import PentaswapV1Factory from '../../build/PentaswapV1Factory.json'
import PentaswapV2Router01 from '../../build/PentaswapV2Router01.json'
import PentaswapV2Migrator from '../../build/PentaswapV2Migrator.json'
import PentaswapV2Router02 from '../../build/PentaswapV2Router02.json'
import RouterEventEmitter from '../../build/RouterEventEmitter.json'

const overrides = {
  gasLimit: 9999999
}

interface V2Fixture {
  token0: Contract
  token1: Contract
  WPEN: Contract
  WPENPartner: Contract
  factoryV1: Contract
  factoryV2: Contract
  router01: Contract
  router02: Contract
  routerEventEmitter: Contract
  router: Contract
  migrator: Contract
  WPENExchangeV1: Contract
  pair: Contract
  WPENPair: Contract
}

export async function v2Fixture(provider: Web3Provider, [wallet]: Wallet[]): Promise<V2Fixture> {
  // deploy tokens
  const tokenA = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const tokenB = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])
  const WPEN = await deployContract(wallet, WPEN9)
  const WPENPartner = await deployContract(wallet, ERC20, [expandTo18Decimals(10000)])

  // deploy V1
  const factoryV1 = await deployContract(wallet, PentaswapV1Factory, [])
  await factoryV1.initializeFactory((await deployContract(wallet, PentaswapV1Exchange, [])).address)

  // deploy V2
  const factoryV2 = await deployContract(wallet, PentaswapV2Factory, [wallet.address])

  // deploy routers
  const router01 = await deployContract(wallet, PentaswapV2Router01, [factoryV2.address, WPEN.address], overrides)
  const router02 = await deployContract(wallet, PentaswapV2Router02, [factoryV2.address, WPEN.address], overrides)

  // event emitter for testing
  const routerEventEmitter = await deployContract(wallet, RouterEventEmitter, [])

  // deploy migrator
  const migrator = await deployContract(wallet, PentaswapV2Migrator, [factoryV1.address, router01.address], overrides)

  // initialize V1
  await factoryV1.createExchange(WPENPartner.address, overrides)
  const WPENExchangeV1Address = await factoryV1.getExchange(WPENPartner.address)
  const WPENExchangeV1 = new Contract(WPENExchangeV1Address, JSON.stringify(PentaswapV1Exchange.abi), provider).connect(
    wallet
  )

  // initialize V2
  await factoryV2.createPair(tokenA.address, tokenB.address)
  const pairAddress = await factoryV2.getPair(tokenA.address, tokenB.address)
  const pair = new Contract(pairAddress, JSON.stringify(IPentaswapV2Pair.abi), provider).connect(wallet)

  const token0Address = await pair.token0()
  const token0 = tokenA.address === token0Address ? tokenA : tokenB
  const token1 = tokenA.address === token0Address ? tokenB : tokenA

  await factoryV2.createPair(WPEN.address, WPENPartner.address)
  const WPENPairAddress = await factoryV2.getPair(WPEN.address, WPENPartner.address)
  const WPENPair = new Contract(WPENPairAddress, JSON.stringify(IPentaswapV2Pair.abi), provider).connect(wallet)

  return {
    token0,
    token1,
    WPEN,
    WPENPartner,
    factoryV1,
    factoryV2,
    router01,
    router02,
    router: router02, // the default router, 01 had a minor bug
    routerEventEmitter,
    migrator,
    WPENExchangeV1,
    pair,
    WPENPair
  }
}
