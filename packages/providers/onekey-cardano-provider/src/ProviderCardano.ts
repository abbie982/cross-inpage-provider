import { ProviderBase } from '@onekeyfe/cross-inpage-provider-core'
import { ProviderCardanoBase } from './ProviderCardanoBase'
import { IInpageProviderConfig } from '@onekeyfe/cross-inpage-provider-core';
import { getOrCreateExtInjectedJsBridge } from '@onekeyfe/extension-bridge-injected';
import { isWalletEventMethodMatch } from './utils'
import { IJsonRpcRequest } from '@onekeyfe/cross-inpage-provider-types';
import { Cbor, Bytes, Cip30DataSignature, Cip30Wallet, NetworkId, Paginate, WalletApi } from './types'
import * as TypeUtils from './type-utils'


export type CardanoRequest = WalletApi & {
  // override the type of the request method
  getUtxos: (params: {amount?: Cbor, paginate?: Paginate}) => Promise<Cbor[] | undefined>
  signTx: (params: {tx: Cbor, partialSign?: boolean}) => Promise<Cbor>
  signData: (params: {addr: Cbor, payload: Bytes}) => Promise<Cip30DataSignature>;
}

export type JsBridgeRequest = {
	[K in keyof CardanoRequest]: (params: Parameters<CardanoRequest[K]>[0]) => Promise<TypeUtils.WireStringified<TypeUtils.ResolvePromise<ReturnType<CardanoRequest[K]>>>>
}

type JsBridgeRequestParams<T extends keyof JsBridgeRequest> = Parameters<JsBridgeRequest[T]>[0]

type JsBridgeRequestResponse<T extends keyof JsBridgeRequest> = ReturnType<JsBridgeRequest[T]>

const PROVIDER_EVENTS = {
  'connect': 'connect',
  'disconnect': 'disconnect',
  'accountChanged': 'accountChanged',
  'message_low_level': 'message_low_level',
} as const;

type CardanoProviderEventsMap = {
  [PROVIDER_EVENTS.connect]: () => void;
  [PROVIDER_EVENTS.disconnect]: () => void;
  [PROVIDER_EVENTS.accountChanged]: (account: null) => void;
  [PROVIDER_EVENTS.message_low_level]: (payload: IJsonRpcRequest) => void;
};

interface IProviderCardano extends ProviderBase {
	isConnected: boolean;

  onekey: Cip30Wallet;

	getNetworkId(): Promise<NetworkId>;
}

type OneKeyCardanoProviderProps = IInpageProviderConfig & {
  timeout?: number;
};

class ProviderCardano extends ProviderCardanoBase implements IProviderCardano {
	get isConnected() {
		return true
	}

  get onekey() {
    return this.walletInfo()
  }

  constructor(props: OneKeyCardanoProviderProps) {
    super({
      ...props,
      bridge: props.bridge || getOrCreateExtInjectedJsBridge({ timeout: props.timeout }),
    });

    this._registerEvents();
  }

	private _registerEvents() {
    window.addEventListener('onekey_bridge_disconnect', () => {
      this._handleDisconnected();
    });

    this.on(PROVIDER_EVENTS.message_low_level, (payload) => {
      const { method, params } = payload;

      if (isWalletEventMethodMatch(method, PROVIDER_EVENTS.accountChanged)) {
        this._handleAccountChange(params);
      }
    });

  }

	private _callBridge<T extends keyof JsBridgeRequest>(params: {
		method: T;
		params: JsBridgeRequestParams<T>;
	}): JsBridgeRequestResponse<T> {
		return this.bridgeRequest(params) as JsBridgeRequestResponse<T>;
	}

	private postMessage(param: any) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		return this._callBridge(param);
	}

	private _handleDisconnected(options: { emit: boolean } = { emit: true }) {
    if (options.emit && this.isConnectionStatusChanged('disconnected')) {
      this.connectionStatus = 'disconnected';
      this.emit('disconnect');
      this.emit('accountChanged', null);
    }
  }

	private _handleAccountChange(payload: any) {
		// TODO: handle account change
	}

	on<E extends keyof CardanoProviderEventsMap>(
    event: E,
    listener: CardanoProviderEventsMap[E],
  ): this {
    return super.on(event, listener);
  }

  emit<E extends keyof CardanoProviderEventsMap>(
    event: E,
    ...args: Parameters<CardanoProviderEventsMap[E]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // CIP30 Wallet API 👇
  walletInfo(): Cip30Wallet {
    return {
      apiVersion: '0.1.0',
      name: 'oneKey',
      icon: 'https://theme.zdassets.com/theme_assets/10237731/cd8f795ce97bdd7657dd4fb4b19fde3f32b50349.png',
      isEnabled: () => Promise.resolve(true),
      enable: () => this.enable() 
     }
  }

  async enable() {
    return Promise.resolve({
      getNetworkId: () => this.getNetworkId(),
      getUtxos:  (amount?: Cbor, paginate?: Paginate) => this.getUtxos(amount, paginate),
      getCollateral: (params?: {amount?: Cbor}) => this.getCollateral(params),
      getBalance: () => this.getBalance(),
      getUsedAddresses: () => this.getUsedAddresses(),
      getUnusedAddresses: () => this.getUnUsedAddress(), 

      getChangeAddress: () => this.getChangeAddress(),
    
      getRewardAddresses: () => this.getRewardAddresses(),
    
      signTx: (tx: Cbor, partialSign?: boolean) => this.signTx(tx, partialSign),
    
      signData: (addr: Cbor, payload: Bytes) => this.signData(addr, payload),
    
      submitTx: (tx: Cbor) => this.submitTx(tx)
    })
  }

  // CIP30 Dapp API 👇

  async getNetworkId(): Promise<NetworkId> {
    return this._callBridge({
			method: 'getNetworkId',
			params: undefined
		})
	}

  async getUtxos(amount?: Cbor, paginate?: Paginate) {
    return this._callBridge({
      method: 'getUtxos',
      params: {
        amount,
        paginate
      }
    })
  }

  async getCollateral(params?: { amount?: Cbor }) {
    return this._callBridge({
      method: 'getCollateral',
      params: {
        amount: params?.amount
      }
    }) 
  }

  async getBalance() {
    return this._callBridge({
      method: 'getBalance',
      params: undefined
    })
  }

  async getUsedAddresses(): Promise<Cbor[]> {
    return this._callBridge({
			method: 'getUsedAddresses',
			params: undefined
		})
  }

  async getUnUsedAddress() {
    return this._callBridge({
      method: 'getUnusedAddresses',
      params: undefined
    })
  }

  async getChangeAddress() {
    return this._callBridge({
      method: 'getChangeAddress',
      params: undefined
    })
  }

  async getRewardAddresses() {
    return this._callBridge({
      method: 'getRewardAddresses',
      params: undefined
    })
  }

  async signTx(tx: Cbor, partialSign?: boolean) {
    return this._callBridge({
      method: 'signTx',
      params: {
        tx,
        partialSign
      }
    })
  }

  async signData(addr: Cbor, payload: Bytes) {
    return this._callBridge({
      method: 'signData',
      params: {
        addr,
        payload
      }
    })
  }

  async submitTx(tx: Cbor) {
    return this._callBridge({
      method: 'submitTx',
      params: tx
    })
  }
}

export {ProviderCardano}
