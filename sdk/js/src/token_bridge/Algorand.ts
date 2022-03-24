// Algorand.ts

import { id, keccak256 } from "ethers/lib/utils";

import * as fs from "fs";

import algosdk, {
    Account,
    Algodv2,
    assignGroupID,
    decodeAddress,
    encodeAddress,
    getApplicationAddress,
    Indexer,
    LogicSigAccount,
    makeApplicationCallTxnFromObject,
    makeApplicationOptInTxnFromObject,
    makeAssetTransferTxnWithSuggestedParamsFromObject,
    makePaymentTxnWithSuggestedParamsFromObject,
    OnApplicationComplete,
    signLogicSigTransaction,
    Transaction,
    waitForConfirmation,
} from "algosdk";
import {
    hexStringToUint8Array,
    PopulateData,
    TmplSig,
    uint8ArrayToHexString,
} from "./TmplSig";

import { TextEncoder, inspect } from "util";

let ALGO_TOKEN = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
let KMD_ADDRESS: string = "http://localhost";
let KMD_PORT: number = 4002;
let KMD_WALLET_NAME: string = "unencrypted-default-wallet";
let KMD_WALLET_PASSWORD: string = "";
let ALGOD_ADDRESS: string = "http://localhost";
let ALGOD_PORT: number = 4001;
let CORE_ID: number = 4;
let TOKEN_BRIDGE_ID: number = 6;

export const SEED_AMT: number = 1002000;
const ZERO_PAD_BYTES =
    "0000000000000000000000000000000000000000000000000000000000000000";
const MAX_KEYS: number = 15;
const MAX_BYTES_PER_KEY: number = 127;
const BITS_PER_BYTE: number = 8;

const BITS_PER_KEY: number = MAX_BYTES_PER_KEY * BITS_PER_BYTE;
const MAX_BYTES: number = MAX_BYTES_PER_KEY * MAX_KEYS;
const MAX_BITS: number = BITS_PER_BYTE * MAX_BYTES;
const COST_PER_VERIF: number = 1000;
const WALLET_BUFFER: number = 200000;
const MAX_SIGS_PER_TXN: number = 9;
const INDEXER_TOKEN: string =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const INDEXER_ADDRESS: string = "http://localhost";
const INDEXER_PORT: number = 8980;

// Generated Testnet wallet
export const TESTNET_ACCOUNT_ADDRESS =
    "RWVYXYLSV32QIHFUMBEBW4BQZR7FDVJGKTVZIVYECMQWU7CZUAK5Q4WMP4";
export const TESTNET_ACCOUNT_MN =
    "enforce sail meat library retreat rain praise run floor drastic flat end true olympic boy dune dust regular feed allow top universe borrow able ginger";

const ALGO_VERIFY_HASH =
    "5PKAA6VERF6XZQAOJVKST262JKLKIYP3EGFO54ZD7YPUV7TRQOZ2BN6SPA";

const ALGO_VERIFY = new Uint8Array([
    6, 32, 4, 1, 0, 32, 20, 38, 1, 0, 49, 32, 50, 3, 18, 68, 49, 16, 129, 6, 18,
    68, 54, 26, 1, 54, 26, 3, 54, 26, 2, 136, 0, 3, 68, 34, 67, 53, 2, 53, 1,
    53, 0, 40, 53, 240, 40, 53, 241, 52, 0, 21, 53, 5, 35, 53, 3, 35, 53, 4, 52,
    3, 52, 5, 12, 65, 0, 68, 52, 1, 52, 0, 52, 3, 129, 65, 8, 34, 88, 23, 52, 0,
    52, 3, 34, 8, 36, 88, 52, 0, 52, 3, 129, 33, 8, 36, 88, 7, 0, 53, 241, 53,
    240, 52, 2, 52, 4, 37, 88, 52, 240, 52, 241, 80, 2, 87, 12, 20, 18, 68, 52,
    3, 129, 66, 8, 53, 3, 52, 4, 37, 8, 53, 4, 66, 255, 180, 34, 137,
]);

// Globals?
class IndexerInfo {
    private static instance: IndexerInfo;
    client: Indexer;
    round: number = 0;

    private constructor() {
        this.round = 0;
        this.client = new Indexer(INDEXER_TOKEN, INDEXER_ADDRESS, INDEXER_PORT);
    }
    public static getInstance(): IndexerInfo {
        if (!IndexerInfo.instance) {
            IndexerInfo.instance = new IndexerInfo();
        }
        return IndexerInfo.instance;
    }
}

export function getKmdClient(): algosdk.Kmd {
    const kmdClient: algosdk.Kmd = new algosdk.Kmd(
        ALGO_TOKEN,
        KMD_ADDRESS,
        KMD_PORT
    );
    return kmdClient;
}

export function getAlgoClient(): algosdk.Algodv2 {
    const algodClient = new algosdk.Algodv2(
        ALGO_TOKEN,
        ALGOD_ADDRESS,
        ALGOD_PORT
    );
    return algodClient;
}

export type TealCompileRsp = {
    hash: string; // base32 SHA512_256 of program bytes (Address style)
    result: string; // base64 encoded program bytes
};

// Conversion functions

export function numberToUint8Array(n: number) {
    if (!n) return new Uint8Array(0);
    const a = [];
    a.unshift(n & 255);
    while (n >= 256) {
        n = n >>> 8;
        a.unshift(n & 255);
    }
    return new Uint8Array(a);
}

export function textToHexString(name: string): string {
    // const enc: TextEncoder = new TextEncoder();
    // const bName: Uint8Array = enc.encode(name);
    // const sName: string = uint8ArrayToHexString(bName, false);
    // return sName;
    return Buffer.from(name, "binary").toString("hex");
}

export function textToUint8Array(name: string): Uint8Array {
    const enc: TextEncoder = new TextEncoder();
    const bName: Uint8Array = enc.encode(name);
    return bName;
}

export function appIdToAppAddr(appId: number): string {
    const appAddr: string = getApplicationAddress(appId);
    const decAppAddr: Uint8Array = decodeAddress(appAddr).publicKey;
    const aa: string = uint8ArrayToHexString(decAppAddr, false);
    return aa;
}

export async function getBalances(
    client: algosdk.Algodv2,
    account: string
): Promise<Map<number, number>> {
    let balances = new Map<number, number>();
    const accountInfo = await client.accountInformation(account).do();
    console.log("Account Info:", accountInfo);
    console.log("Account Info|created-assets:", accountInfo["created-assets"]);

    // Put the algo balance in key 0
    balances.set(0, accountInfo.amount);

    const assets: Array<any> = accountInfo.assets;
    console.log("assets", assets);
    assets.forEach(function (asset) {
        console.log("inside foreach", asset);
        const assetId = asset["asset-id"];
        const amount = asset.amount;
        balances.set(assetId, amount);
    });
    console.log("balances", balances);
    return balances;
}

export async function getBalance(
    client: algosdk.Algodv2,
    account: string,
    key: number
): Promise<number> {
    let balances = new Map<number, number>();
    const accountInfo = await client.accountInformation(account).do();

    if (key == 0) {
        return accountInfo.amount;
    }

    let ret = 0;
    const assets: Array<any> = accountInfo.assets;
    assets.forEach((asset) => {
        if (key === asset["asset-id"]) {
            ret = asset.amount;
            return;
        }
    });
    return ret;
}

export async function getMessageFee(client: algosdk.Algodv2): Promise<number> {
    const applInfo: Record<string, any> = await client
        .getApplicationByID(CORE_ID)
        .do();
    const globalState = applInfo["params"]["global-state"];
    console.log("globalState:", globalState);
    const key: string = Buffer.from("MessageFee", "binary").toString("base64");
    console.log("key", key);
    let ret = -1;
    globalState.forEach((el: any) => {
        if (el["key"] === key) {
            ret = el["value"]["uint"];
            return;
        }
    });
    return ret;
}

export function parseSeqFromLog(txn: any): bigint {
    const innerTxns = txn.innerTxns[-1];
    const logs = innerTxns["logs"];
    const seqNum = logs[0];
    const bufSN = Buffer.from(seqNum, "base64");
    const sn = bufSN.readBigUInt64BE();
    return sn;
}

export async function attestFromAlgorand(
    client: algosdk.Algodv2,
    senderAcct: Account,
    assetId: number
): Promise<string> {
    const appIndex: number = 0; // appIndex is 0 for attestations
    const tbAddr: string = getApplicationAddress(TOKEN_BRIDGE_ID);
    const decTbAddr: Uint8Array = decodeAddress(tbAddr).publicKey;
    const aa: string = uint8ArrayToHexString(decTbAddr, false);
    const emitterAddr: string = await optin(client, senderAcct, CORE_ID, 0, aa);
    const acctInfo = await client.accountInformation(senderAcct.addr).do();
    let creatorAddr = acctInfo["created-assets"]["creator"];
    const creatorAcctInfo = await client.accountInformation(creatorAddr).do();
    const bPgmName: Uint8Array = textToUint8Array("attestToken");
    const wormhole: boolean = creatorAcctInfo["auth-addr"] === tbAddr;
    if (!wormhole) {
        console.log("Not wormhole.  Need to optin...");
        creatorAddr = await optin(
            client,
            senderAcct,
            TOKEN_BRIDGE_ID,
            appIndex,
            textToHexString("native")
        );
    }
    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();

    let txns = [];
    let signedTxns = [];

    const firstTxn = makeApplicationCallTxnFromObject({
        from: senderAcct.addr,
        appIndex: TOKEN_BRIDGE_ID,
        onComplete: OnApplicationComplete.NoOpOC,
        appArgs: [textToUint8Array("nop")],
        suggestedParams: params,
    });
    txns.push(firstTxn);
    signedTxns.push(firstTxn.signTxn(senderAcct.sk));

    const mfee = await getMessageFee(client);
    if (mfee > 0) {
        const feeTxn = makePaymentTxnWithSuggestedParamsFromObject({
            from: senderAcct.addr,
            suggestedParams: params,
            to: getApplicationAddress(TOKEN_BRIDGE_ID),
            amount: mfee,
        });
        txns.push(feeTxn);
        signedTxns.push(feeTxn.signTxn(senderAcct.sk));
    }

    let appTxn = makeApplicationCallTxnFromObject({
        appArgs: [bPgmName, numberToUint8Array(assetId)],
        accounts: [
            emitterAddr,
            creatorAddr,
            creatorAcctInfo["address"],
            getApplicationAddress(CORE_ID),
        ],
        appIndex: TOKEN_BRIDGE_ID,
        foreignApps: [CORE_ID],
        foreignAssets: [assetId],
        from: senderAcct.addr,
        onComplete: OnApplicationComplete.NoOpOC,
        suggestedParams: params,
    });
    if (mfee > 0) {
        appTxn.fee *= 3;
    } else {
        appTxn.fee *= 2;
    }
    txns.push(appTxn);
    signedTxns.push(appTxn.signTxn(senderAcct.sk));
    const { txId } = await client.sendRawTransaction(signedTxns).do();
    // wait for transaction to be confirmed
    const ptx = await waitForConfirmation(client, txId, 1);

    return txId;
}

export async function accountExists(
    client: algosdk.Algodv2,
    appId: number,
    acctAddr: string
): Promise<boolean> {
    let ret = false;
    try {
        const acctInfo = await client.accountInformation(acctAddr).do();
        console.log(
            "appId",
            appId,
            "acctAddr",
            acctAddr,
            "acctInfo:",
            acctInfo
        );
        const als: Record<string, any>[] = acctInfo["apps-local-state"];
        console.log("als:", als);
        if (!als) {
            return ret;
        }
        als.forEach((app) => {
            console.log("Inside for loop");

            if (app["id"] === appId) {
                ret = true;
                return;
            }
        });
    } catch (e) {
        console.error("Failed to check for account existence:", e);
    }

    if (ret) console.log("returning true");
    else console.log("returning false");
    return ret;
}

export async function optin(
    client: algosdk.Algodv2,
    sender: Account,
    appId: number,
    appIndex: number,
    emitterId: string
): Promise<string> {
    // This is the application address associated with the application ID
    const appAddr: string = getApplicationAddress(appId);
    const decAppAddr: Uint8Array = decodeAddress(appAddr).publicKey;
    const aa: string = uint8ArrayToHexString(decAppAddr, false);

    let data: PopulateData = {
        addrIdx: appIndex,
        appAddress: aa,
        appId: appId,
        emitterId: emitterId,
        seedAmt: SEED_AMT,
    };

    const ts: TmplSig = new TmplSig(client);
    const lsa: LogicSigAccount = await ts.populate(data);
    const sigAddr: string = lsa.address();

    // Check to see if we need to create this
    console.log("Checking to see if account exists...");
    const retval: boolean = await accountExists(client, appId, sigAddr);
    if (!retval) {
        console.log("Account does not exist.");
        // These are the suggested params from the system
        console.log("Getting parms...");
        const params = await client.getTransactionParams().do();
        console.log("Creating payment txn...");
        const seedTxn = makePaymentTxnWithSuggestedParamsFromObject({
            from: sender.addr,
            to: sigAddr,
            amount: SEED_AMT,
            suggestedParams: params,
        });
        console.log("Creating optin txn...");
        const optinTxn = makeApplicationOptInTxnFromObject({
            from: sigAddr,
            suggestedParams: params,
            appIndex: appId,
        });
        console.log("Creating rekey txn...");
        const rekeyTxn = makePaymentTxnWithSuggestedParamsFromObject({
            from: sigAddr,
            to: sigAddr,
            amount: 0,
            suggestedParams: params,
            rekeyTo: appAddr,
        });

        console.log("Assigning group ID...");
        assignGroupID([seedTxn, optinTxn, rekeyTxn]);

        console.log("Signing seed...");
        const signedSeedTxn = seedTxn.signTxn(sender.sk);
        console.log("Signing optin...");
        const signedOptinTxn = signLogicSigTransaction(optinTxn, lsa);
        console.log("Signing rekey...");
        const signedRekeyTxn = signLogicSigTransaction(rekeyTxn, lsa);

        console.log("Sending txns...");
        const txnId = await client
            .sendRawTransaction([
                signedSeedTxn,
                signedOptinTxn.blob,
                signedRekeyTxn.blob,
            ])
            .do();

        console.log("Awaiting confirmation...");
        const confirmedTxns = await algosdk.waitForConfirmation(
            client,
            txnId,
            1
        );
        console.log("optin confirmation", confirmedTxns);
    }
    return sigAddr;
}

export function getLogicSigAccount(program: Uint8Array): LogicSigAccount {
    const lsa = new LogicSigAccount(program);
    return lsa;
}

function extract3(buffer: any, start: number, size: number) {
    return buffer.slice(start, start + size);
}

export function parseVAA(vaa: Uint8Array): Map<string, any> {
    let ret = new Map<string, any>();
    let buf = Buffer.from(vaa);
    ret.set("version", buf.readIntBE(0, 1));
    ret.set("index", buf.readIntBE(1, 4));
    ret.set("siglen", buf.readIntBE(5, 1));
    const siglen = ret.get("siglen");
    if (siglen) {
        ret.set("signatures", extract3(vaa, 6, siglen * 66));
    }
    const sigs = [];
    for (let i = 0; i < siglen; i++) {
        const start = 6 + i * 66;
        const len = 66;
        const sigBuf = extract3(vaa, start, len);
        sigs.push(sigBuf);
    }
    ret.set("sigs", sigs);
    let off = siglen * 66 + 6;
    ret.set("digest", vaa.slice(off)); // This is what is actually signed...
    ret.set("timestamp", buf.readIntBE(off, 4));
    off += 4;
    ret.set("nonce", buf.readIntBE(off, 4));
    off += 4;
    ret.set("chainRaw", Buffer.from(extract3(vaa, off, 2)).toString("hex"));
    ret.set("chain", buf.readIntBE(off, 2));
    off += 2;
    ret.set("emitter", Buffer.from(extract3(vaa, off, 32)).toString("hex"));
    off += 32;
    ret.set("sequence", buf.readBigUInt64BE(off));
    off += 8;
    ret.set("consistency", buf.readIntBE(off, 1));
    off += 1;

    ret.set("Meta", "Unknown");

    if (
        !Buffer.compare(extract3(buf, off, 32), Buffer.from("000000000000000000000000000000000000000000546f6b656e427269646765", "hex"))
    ) {
        ret.set("Meta", "TokenBridge");
        ret.set("module", extract3(vaa, off, 32));
        off += 32;
        ret.set("action", buf.readIntBE(off, 1));
        off += 1;
        if (ret.get("action") === 1) {
            ret.set("Meta", "TokenBridge RegisterChain");
            ret.set("targetChain", buf.readIntBE(off, 2));
            off += 2;
            ret.set("EmitterChainID", buf.readIntBE(off, 2));
            off += 2;
            ret.set("targetEmitter", extract3(vaa, off, 32));
            off += 32;
        } else if (ret.get("action") === 2) {
            ret.set("Meta", "TokenBridge UpgradeContract");
            ret.set("targetChain", buf.readIntBE(off, 2));
            off += 2;
            ret.set("newContract", extract3(vaa, off, 32));
            off += 32;
        }
    } else if (
        !Buffer.compare(extract3(buf, off, 32), Buffer.from("00000000000000000000000000000000000000000000000000000000436f7265", "hex"))
    ) {
        ret.set("Meta", "CoreGovernance");
        ret.set("module", extract3(vaa, off, 32));
        off += 32;
        ret.set("action", buf.readIntBE(off, 1));
        off += 1;
        ret.set("targetChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("NewGuardianSetIndex", buf.readIntBE(off, 4));
    }
    if (Buffer.from(vaa, off).length === 100 && buf.readIntBE(off, 1) === 2) {
        ret.set("Meta", "TokenBridge Attest");
        ret.set("Type", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Contract", extract3(vaa, off, 32));
        off += 32;
        ret.set("FromChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("Decimals", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Symbol", extract3(vaa, off, 32));
        off += 32;
        ret.set("Name", extract3(vaa, off, 32));
    }

    if (Buffer.from(vaa, off).length === 133 && buf.readIntBE(off, 1) === 1) {
        ret.set("Meta", "TokenBridge Transfer");
        ret.set("Type", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Amount", extract3(vaa, off, 32));
        off += 32;
        ret.set("Contract", extract3(vaa, off, 32));
        off += 32;
        ret.set("FromChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("ToAddress", extract3(vaa, off, 32));
        off += 32;
        ret.set("ToChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("Fee", extract3(vaa, off, 32));
    }

    if (buf.readIntBE(off, 1) === 3) {
        ret.set("Meta", "TokenBridge Transfer With Payload");
        ret.set("Type", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Amount", extract3(vaa, off, 32));
        off += 32;
        ret.set("Contract", extract3(vaa, off, 32));
        off += 32;
        ret.set("FromChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("ToAddress", extract3(vaa, off, 32));
        off += 32;
        ret.set("ToChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("Fee", extract3(vaa, off, 32));
        off += 32;
        ret.set("Payload", Buffer.from(vaa, off));
    }

    return ret;
}

export async function decodeLocalState(
    client: algosdk.Algodv2,
    appId: number,
    address: string
): Promise<Uint8Array> {
    let app_state = null;
    const ai = await client.accountInformation(address).do();
    for (const app of ai["apps-local-state"]) {
        if (app["id"] === appId) {
            app_state = app["key-value"];
            break;
        }
    }

    let ret = Buffer.alloc(0);
    if (app_state) {
        const e = Buffer.alloc(127);
        const m = Buffer.from("meta");

        const vals: Map<number, Buffer> = new Map<number, Buffer>();
        for (const kv of app_state) {
            const k = Buffer.from(kv["key"], "base64");
            if (!Buffer.compare(k, m)) {
                continue;
            }
            const key: number = k.readInt8();
            const v: Buffer = Buffer.from(kv["value"]["bytes"], "base64");
            if (Buffer.compare(v, e)) {
                vals.set(key, v);
            }
        }

        vals.forEach((v) => {
            ret = Buffer.concat([ret, v]);
        });
    }
    return new Uint8Array(ret);
}

export async function assetOptinCheck(
    client: algosdk.Algodv2,
    asset: number,
    receiver: string
): Promise<boolean> {
    const acctInfo = await client.accountInformation(receiver).do();
    const assets: Array<any> = acctInfo.assets;
    console.log("assets", assets);
    let ret = false;
    assets.forEach(function (asset) {
        console.log("inside foreach", asset);
        const assetId = asset["asset-id"];
        if (assetId === asset) {
            ret = true;
            return;
        }
    });
    return ret;
}

export async function assetOptin(
    client: algosdk.Algodv2,
    sender: Account,
    asset: number,
    receiver: string
) {
    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();

    // Create transaction
    const optinTxn: Transaction =
        makeAssetTransferTxnWithSuggestedParamsFromObject({
            amount: 0,
            assetIndex: asset,
            from: sender.addr,
            suggestedParams: params,
            to: receiver,
        });

    // Sign transaction
    const signedOptinTxn: Uint8Array = optinTxn.signTxn(sender.sk);

    // Send transaction
    const txId: string = await client.sendRawTransaction(signedOptinTxn).do();

    // Wait for response
    const confirmedTxn = await waitForConfirmation(client, txId, 4);
    console.log("assetOptin confirmation:", confirmedTxn);

    // Double check the result
    if (!assetOptinCheck(client, asset, receiver)) {
        throw new Error("assetOptin() failed ");
    }
}

class SubmitVAAState {
    vaaMap: Map<string, any>;
    accounts: string[];
    txns: Array<algosdk.Transaction>;
    guardianAddr: string;

    constructor(
        vaaMap: Map<string, any>,
        accounts: string[],
        txns: Array<algosdk.Transaction>,
        guardianAddr: string
    ) {
        this.vaaMap = vaaMap;
        this.accounts = accounts;
        this.txns = txns;
        this.guardianAddr = guardianAddr;
    }
}

export async function submitVAAHdr(
    vaa: Uint8Array,
    client: algosdk.Algodv2,
    sender: Account,
    appid: number
): Promise<SubmitVAAState> {
    // A lot of our logic here depends on parseVAA and knowing what the payload is..
    const parsedVAA: Map<string, any> = parseVAA(vaa);
    const seq: number = Number(parsedVAA.get("sequence")) / MAX_BITS;
    const chainRaw: string = parsedVAA.get("chainRaw"); // TODO: this needs to be a hex string
    const em: string = parsedVAA.get("emitter"); // TODO: this needs to be a hex string
    const index: number = parsedVAA.get("index");
    console.log(parsedVAA);

    const seqAddr: string = await optin(
        client,
        sender,
        appid,
        seq,
        chainRaw + em
    );
    const guardianPgmName = textToHexString("guardian");
    // And then the signatures to help us verify the vaa_s
    const guardianAddr: string = await optin(
        client,
        sender,
        CORE_ID,
        index,
        guardianPgmName
    );

    let accts: string[] = [seqAddr, guardianAddr];

    // When we attest for a new token, we need some place to store the info... later we will need to
    // mirror the other way as well
    const keys: Uint8Array = await decodeLocalState(
        client,
        CORE_ID,
        guardianAddr
    );

    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();
    let txns: Array<algosdk.Transaction> = [];

    // Right now there is not really a good way to estimate the fees,
    // in production, on a conjested network, how much verifying
    // the signatures is going to cost.

    // So, what we do instead
    // is we top off the verifier back up to 2A so effectively we
    // are paying for the previous persons overrage which on a
    // unconjested network should be zero

    let pmt: number = 3 * COST_PER_VERIF;
    let bal = await getBalance(client, ALGO_VERIFY_HASH, 0);
    console.log("bal", bal);
    if (WALLET_BUFFER - bal >= pmt) {
        pmt = WALLET_BUFFER - bal;
    }

    console.log("payTxn", {
        from: sender.addr,
        to: ALGO_VERIFY_HASH,
        amount: pmt,
        suggestedParams: params,
    });
    console.log("pmt", typeof pmt);

    const payTxn = makePaymentTxnWithSuggestedParamsFromObject({
        from: sender.addr,
        to: ALGO_VERIFY_HASH,
        amount: pmt,
        suggestedParams: params,
    });
    console.log("fnlTxn", payTxn);
    txns.push(payTxn);

    // We don't pass the entire payload in but instead just pass it pre digested.  This gets around size
    // limitations with lsigs AND reduces the cost of the entire operation on a conjested network by reducing the
    // bytes passed into the transaction
    // This is a 2 pass digest
    const digest = keccak256(keccak256(parsedVAA.get("digest"))).slice(2);

    //    const data = parsedVAA.get("digest")
    //    process.stdout.write("srcDigest" + `${inspect(data, { maxArrayLength: 1000 })}\n`)
    //    console.log("digest", digest);
    //    console.log("adigest", hexStringToUint8Array(digest));

    // How many signatures can we process in a single txn... we can do 9!
    // There are likely upwards of 19 signatures.  So, we ned to split things up
    const numSigs: number = parsedVAA.get("siglen");
    let numTxns: number = Math.floor(numSigs / MAX_SIGS_PER_TXN) + 1;

    const SIG_LEN: number = 66;
    const BSIZE: number = SIG_LEN * MAX_SIGS_PER_TXN;
    const signatures: Uint8Array = parsedVAA.get("signatures");
    const verifySigArg: Uint8Array = textToUint8Array("verifySigs");
    for (let nt = 0; nt < numTxns; nt++) {
        let sigs: Uint8Array = signatures.slice(nt * BSIZE);
        if (sigs.length > BSIZE) {
            sigs = sigs.slice(0, BSIZE);
        }

        // The keyset is the set of guardians that correspond
        // to the current set of signatures in this loop.
        // Each signature in 20 bytes and comes from decodeLocalState()
        const GuardianKeyLen: number = 20;
        const numSigsThisTxn = sigs.length / SIG_LEN;
        let arraySize: number = numSigsThisTxn * GuardianKeyLen;
        let keySet: Uint8Array = new Uint8Array(arraySize);
        for (let i = 0; i < numSigsThisTxn; i++) {
            // The first byte of the sig is the relative index of that signature in the signatures array
            // Use that index to get the appropriate guardian key
            const idx = sigs[i * SIG_LEN];
            const key = keys.slice(
                idx * GuardianKeyLen + 1,
                (idx + 1) * GuardianKeyLen + 1
            );
            keySet.set(key, i * 20);
        }

        console.log("xxx", keySet);

        const appTxn = makeApplicationCallTxnFromObject({
            appArgs: [
                verifySigArg,
                sigs,
                keySet,
                hexStringToUint8Array(digest),
            ],
            accounts: accts,
            appIndex: CORE_ID,
            from: ALGO_VERIFY_HASH,
            onComplete: OnApplicationComplete.NoOpOC,
            suggestedParams: params,
        });
        txns.push(appTxn);
    }
    const appTxn = makeApplicationCallTxnFromObject({
        appArgs: [textToUint8Array("verifyVAA"), vaa],
        accounts: accts,
        appIndex: CORE_ID,
        from: sender.addr,
        onComplete: OnApplicationComplete.NoOpOC,
        suggestedParams: params,
    });
    txns.push(appTxn);

    return new SubmitVAAState(parsedVAA, accts, txns, guardianAddr);
}

export async function simpleSignVAA(
    vaa: Uint8Array,
    client: algosdk.Algodv2,
    sender: Account,
    appid: number,
    txns: Array<algosdk.Transaction>
) {
    //    console.log("simpleSignVAA")
    //    console.log(txns)
    assignGroupID(txns);
    const signedTxns: Uint8Array[] = [];
    txns.forEach((txn) => {
        console.log(txn);
        if (
            txn.appArgs &&
            txn.appArgs?.length > 0 &&
            JSON.stringify(txn.appArgs[0]) ===
                JSON.stringify(textToUint8Array("verifySigs"))
        ) {
            const lsa = new LogicSigAccount(ALGO_VERIFY);
            const stxn = signLogicSigTransaction(txn, lsa);
            signedTxns.push(stxn.blob);
        } else {
            signedTxns.push(txn.signTxn(sender.sk));
        }
    });

    //    console.log("sendRawTransaction", signedTxns)
    const resp = await client.sendRawTransaction(signedTxns).do();

    //    console.log("waiting for confirmation", txns[txns.length-1].txID())
    const ret: string[] = [];
    const response = await waitForConfirmation(
        client,
        txns[txns.length - 1].txID(),
        1
    );

    //    console.log("submitVAA confirmation", response);
    if (response["logs"]) {
        ret.push(response["logs"]);
    }
    return ret;
}

export async function submitVAA(
    vaa: Uint8Array,
    client: algosdk.Algodv2,
    sender: Account,
    appid: number
) {
    let sstate = await submitVAAHdr(vaa, client, sender, appid);

    let parsedVAA = sstate.vaaMap;
    let accts = sstate.accounts;
    let txns = sstate.txns;

    // If this happens to be setting up a new guardian set, we probably need it as well...
    if (
        parsedVAA.get("Meta") === "CoreGovernance" &&
        parsedVAA.get("action") === 2
    ) {
        const ngsi = parsedVAA.get("NewGuardianSetIndex");
        const guardianPgmName = textToHexString("guardian");
        const newGuardianAddr = await optin(
            client,
            sender,
            CORE_ID,
            ngsi,
            guardianPgmName
        );
        accts.push(newGuardianAddr);
    }

    // When we attest for a new token, we need some place to store the info... later we will need to
    // mirror the other way as well
    const meta = parsedVAA.get("Meta");
    let chainAddr: string = "";
    if (
        meta === "TokenBridge Attest" ||
        meta === "TokenBridge Transfer" ||
        meta === "TokenBridge Transfer With Payload"
    ) {
        if (parsedVAA.get("FromChain") != 8) {
            chainAddr = await optin(
                client,
                sender,
                TOKEN_BRIDGE_ID,
                parsedVAA.get("FromChain"),
                parsedVAA.get("Contract")
            );
        } else {
            const contract: Buffer = parsedVAA.get("Contract");
            const assetId = contract.readIntBE(0, 4);
            chainAddr = await optin(
                client,
                sender,
                TOKEN_BRIDGE_ID,
                assetId,
                textToHexString("native")
            );
        }
        accts.push(chainAddr);
    }

    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();

    if (meta === "CoreGovernance") {
        txns.push(
            makeApplicationCallTxnFromObject({
                appArgs: [textToUint8Array("governance"), vaa],
                accounts: accts,
                appIndex: CORE_ID,
                from: sender.addr,
                onComplete: OnApplicationComplete.NoOpOC,
                suggestedParams: params,
            })
        );
    }
    if (
        meta === "TokenBridge RegisterChain" ||
        meta === "TokenBridge UpgradeContract"
    ) {
        txns.push(
            makeApplicationCallTxnFromObject({
                appArgs: [textToUint8Array("governance"), vaa],
                accounts: accts,
                appIndex: TOKEN_BRIDGE_ID,
                foreignApps: [CORE_ID],
                from: sender.addr,
                onComplete: OnApplicationComplete.NoOpOC,
                suggestedParams: params,
            })
        );
    }

    if (meta === "TokenBridge Attest") {
        let asset: Uint8Array = await decodeLocalState(
            client,
            TOKEN_BRIDGE_ID,
            chainAddr
        );
        let foreignAssets: number[] = [];
        if (asset.length > 8) {
            const tmp = Buffer.from(asset.slice(0, 8));
            foreignAssets.push(Number(tmp.readBigUInt64BE(0)));
        }
        txns.push(
            makePaymentTxnWithSuggestedParamsFromObject({
                from: sender.addr,
                to: chainAddr,
                amount: 100000,
                suggestedParams: params,
            })
        );
        let buf: Uint8Array = new Uint8Array(1);
        buf[0] = 0x01;
        txns.push(
            makeApplicationCallTxnFromObject({
                appArgs: [textToUint8Array("nop"), buf],
                appIndex: TOKEN_BRIDGE_ID,
                from: sender.addr,
                onComplete: OnApplicationComplete.NoOpOC,
                suggestedParams: params,
            })
        );

        buf[0] = 0x02;
        txns.push(
            makeApplicationCallTxnFromObject({
                appArgs: [textToUint8Array("nop"), buf],
                appIndex: TOKEN_BRIDGE_ID,
                from: sender.addr,
                onComplete: OnApplicationComplete.NoOpOC,
                suggestedParams: params,
            })
        );

        txns.push(
            makeApplicationCallTxnFromObject({
                accounts: accts,
                appArgs: [textToUint8Array("receiveAttest"), vaa],
                appIndex: TOKEN_BRIDGE_ID,
                foreignAssets: foreignAssets,
                from: sender.addr,
                onComplete: OnApplicationComplete.NoOpOC,
                suggestedParams: params,
            })
        );
        txns[-1].fee = txns[-1].fee * 2;
    }

    if (
        meta === "TokenBridge Transfer" ||
        meta === "TokenBridge Transfer With Payload"
    ) {
        let foreignAssets = [];
        let a: number = 0;
        if (parsedVAA.get("FromChain") != 8) {
            let asset = await decodeLocalState(
                client,
                TOKEN_BRIDGE_ID,
                chainAddr
            );
            if (asset.length > 8) {
                const tmp = Buffer.from(asset.slice(0, 8));
                a = Number(tmp.readBigUInt64BE(0));
            }
        } else {
            const tmp = Buffer.from(
                hexStringToUint8Array(parsedVAA.get("Contract"))
            );
            a = Number(tmp.readBigUInt64BE(0));
        }

        // The receiver needs to be optin in to receive the coins... Yeah, the relayer pays for this

        const addr = encodeAddress(
            hexStringToUint8Array(parsedVAA.get("ToAddress"))
        );

        if (a != 0) {
            foreignAssets.push(a);
            assetOptin(client, sender, foreignAssets[0], addr);
            // And this is how the relayer gets paid...
            if (parsedVAA.get("Fee") != ZERO_PAD_BYTES) {
                assetOptin(client, sender, foreignAssets[0], sender.addr);
            }
        }
        accts.push(addr);
        txns.push(
            makeApplicationCallTxnFromObject({
                accounts: accts,
                appArgs: [textToUint8Array("receiveTransfer"), vaa],
                appIndex: TOKEN_BRIDGE_ID,
                foreignAssets: foreignAssets,
                from: sender.addr,
                onComplete: OnApplicationComplete.NoOpOC,
                suggestedParams: params,
            })
        );

        // We need to cover the inner transactions
        if (parsedVAA.get("Fee") != ZERO_PAD_BYTES) {
            txns[-1].fee = txns[-1].fee * 3;
        } else {
            txns[-1].fee = txns[-1].fee * 2;
        }
    }

    return await simpleSignVAA(vaa, client, sender, appid, txns);
}

export async function getVAA(
    client: Algodv2,
    sender: Account,
    sid: bigint,
    app: number
): Promise<Uint8Array> {
    if (!sid) {
        throw new Error("getVAA called with a sid of None");
    }
    const sAddr: string = getApplicationAddress(app);
    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();

    // SOOO, we send a nop txn through to push the block forward one

    // This is ONLY needed on a local net...  the indexer will sit
    // on the last block for 30 to 60 seconds... we don't want this
    // log in prod since it is wasteful of gas

    if (IndexerInfo.getInstance().round > 512) {
        // until they fix it
        console.log(
            "indexer is broken in local net... stop/clean/restart the sandbox"
        );
        throw new Error("Indexer > 512");
    }

    console.log("getVAA");
    let txns = [];
    let signedTxns = [];

    let txn = makeApplicationCallTxnFromObject({
        from: sender.addr,
        appIndex: TOKEN_BRIDGE_ID,
        onComplete: OnApplicationComplete.NoOpOC,
        appArgs: [textToUint8Array("nop")],
        suggestedParams: params,
    });
    txns.push(txn);
    signedTxns.push(txn.signTxn(sender.sk));
    const { txId } = await client.sendRawTransaction(signedTxns).do();

    while (true) {
        let nextToken: string = "";
        while (true) {
            const response: Record<string, any> =
                await IndexerInfo.getInstance()
                    .client.searchForTransactions()
                    .nextToken(nextToken)
                    .minRound(1)
                    .notePrefix(textToUint8Array("publishMessage"))
                    .do();
            // console.log("getVAA() - response:", response);
            let transactions = response["transactions"];
            transactions.forEach((element: any) => {
                // console.log("transaction element:", element);
                let innerTxns = element["inner-txns"];
                console.log("innerTxns:", innerTxns);
                innerTxns.forEach((el: any) => {
                    const at = el["application-transaction"];
                    // console.log("checking at:", at);
                    if (!at) return;
                    // console.log("checking app id:", at["application-id"]);
                    // if (at["application-id"] != CORE_ID) return;
                    const logs = at["logs"];
                    if (!logs || logs.length == 0) return;
                    console.log("checking logs:", at["logs"]);
                    const args = at["application-args"];
                    if (args) {
                        console.log("checking args:", at["application-args"]);
                    }
                    if (args.length < 2) return;
                    if (
                        Buffer.from(args[0], "base64").toString("hex") !=
                        textToHexString("publishMessage")
                    )
                        return;
                    const seq = parseSeqFromLog(element);
                    if (seq != sid) return;
                    if (el["sender"] != sAddr) return;
                    const emitter = decodeAddress(el["sender"]);
                    const payload = Buffer.from(args[1], "base64");
                    // pprint.pprint([seq, y["sender"], payload.hex()])
                    // sys.exit(0)
                    // return self.gt.genVaa(emitter, seq, payload);
                });
            });
            let numTransactions = transactions.length;
            console.log(
                "numTransactions",
                numTransactions,
                "next-token",
                nextToken
            );
            if (response["next-token"]) {
                nextToken = response["next-token"];
                console.log("setting nextToken to", nextToken);
            } else {
                IndexerInfo.getInstance().round = response["current-round"] + 1;
                console.log(
                    "publishMessage = ",
                    textToUint8Array("publishMessage")
                );
                break;
            }
        }
        break;
    }
    // }
    // }
    //         while True:
    //             nexttoken = ""
    //             while True:
    //                 response = self.myindexer.search_transactions( min_round=self.INDEXER_ROUND,
    //note_prefix=self.NOTE_PREFIX, next_page=nexttoken)
    // #                pprint.pprint(response)
    //                 for x in response["transactions"]:
    // #                    pprint.pprint(x)
    //                     for y in x["inner-txns"]:
    //                         if "application-transaction" not in y:
    //                             continue
    //                         if y["application-transaction"]["application-id"] != self.coreid:
    //                             continue
    //                         if len(y["logs"]) == 0:
    //                             continue
    //                         args = y["application-transaction"]["application-args"]
    //                         if len(args) < 2:
    //                             continue
    //                         if base64.b64decode(args[0]) != b'publishMessage':
    //                             continue
    //                         seq = int.from_bytes(base64.b64decode(y["logs"][0]), "big")
    //                         if seq != sid:
    //                             continue
    //                         if y["sender"] != saddr:
    //                             continue;
    //                         emitter = decode_address(y["sender"])
    //                         payload = base64.b64decode(args[1])
    // #                        pprint.pprint([seq, y["sender"], payload.hex()])
    // #                        sys.exit(0)
    //                         return self.gt.genVaa(emitter, seq, payload)

    //                 if 'next-token' in response:
    //                     nexttoken = response['next-token']
    //                 else:
    //                     self.INDEXER_ROUND = response['current-round'] + 1
    //                     break
    //             time.sleep(1)
    const rv: Uint8Array = new Uint8Array();
    return rv;
}

export async function transferAsset(
    client: algosdk.Algodv2,
    sender: Account,
    assetId: number,
    qty: number,
    receiver: Account,
    chain: number,
    fee: number
) {
    const tokenAddr: string = getApplicationAddress(TOKEN_BRIDGE_ID);
    const applAddr: string = appIdToAppAddr(TOKEN_BRIDGE_ID);
    const emitterAddr: string = await optin(
        client,
        sender,
        CORE_ID,
        0,
        applAddr
    );
    const assetInfo: Record<string, any> = await client
        .getAssetByID(assetId)
        .do();
    const authAddr: string = assetInfo["auth-addr"];
    let wormhole: boolean = false;
    let creator;
    let creatorAcctInfo: any;
    //  asset_id 0 is ALGO
    if (assetId != 0) {
        creator = assetInfo["params"]["creator"];
        creatorAcctInfo = await client.accountInformation(creator).do();
        if (authAddr === tokenAddr) {
            wormhole = true;
        }
    }
    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();
    let txns: algosdk.Transaction[] = [];
    let signedTxns = [];
    const msgFee: number = await getMessageFee(client);
    if (msgFee > 0) {
        const payTxn: algosdk.Transaction =
            makePaymentTxnWithSuggestedParamsFromObject({
                from: sender.addr,
                suggestedParams: params,
                to: getApplicationAddress(TOKEN_BRIDGE_ID),
                amount: msgFee,
            });
        txns.push(payTxn);
        signedTxns.push(payTxn.signTxn(sender.sk));
    }
    if (!wormhole) {
        const bNat = Buffer.from("native", "binary").toString("hex");
        creator = await optin(client, sender, TOKEN_BRIDGE_ID, assetId, bNat);
    }
    if (assetId != 0 && !assetOptinCheck(client, assetId, creator)) {
        // Looks like we need to optin
        const payTxn: algosdk.Transaction =
            makePaymentTxnWithSuggestedParamsFromObject({
                from: sender.addr,
                to: creator,
                amount: 100000,
                suggestedParams: params,
            });
        txns.push(payTxn);
        signedTxns.push(payTxn.signTxn(sender.sk));
        // The tokenid app needs to do the optin since it has signature authority
        const bOptin = Buffer.from("optin", "binary");
        let txn = makeApplicationCallTxnFromObject({
            from: sender.addr,
            appIndex: TOKEN_BRIDGE_ID,
            onComplete: OnApplicationComplete.NoOpOC,
            appArgs: [bOptin, numberToUint8Array(assetId)],
            foreignAssets: [assetId],
            accounts: [creator],
            suggestedParams: params,
        });
        txn.fee *= 2;
        txns.push(txn);
        signedTxns.push(txn.signTxn(sender.sk));
        const { txId } = await client.sendRawTransaction(signedTxns).do();
        await waitForConfirmation(client, txId, 4);
        txns = [];
        signedTxns = [];
    }
    const t = makeApplicationCallTxnFromObject({
        from: sender.addr,
        appIndex: TOKEN_BRIDGE_ID,
        onComplete: OnApplicationComplete.NoOpOC,
        appArgs: [textToUint8Array("nop")],
        suggestedParams: params,
    });
    txns.push(t);
    signedTxns.push(t.signTxn(sender.sk));

    let accounts: string[] = [];
    if (assetId === 0) {
        const t = makePaymentTxnWithSuggestedParamsFromObject({
            from: sender.addr,
            to: creator,
            amount: qty,
            suggestedParams: params,
        });
        txns.push(t);
        signedTxns.push(t.signTxn(sender.sk));
        accounts = [emitterAddr, creator, creator];
    } else {
        const t = makeAssetTransferTxnWithSuggestedParamsFromObject({
            from: sender.addr,
            to: creator,
            suggestedParams: params,
            amount: qty,
            assetIndex: assetId,
        });
        txns.push(t);
        signedTxns.push(t.signTxn(sender.sk));
        accounts = [emitterAddr, creator, creatorAcctInfo["address"]];
    }
    let args = [
        textToUint8Array("sendTransfer"),
        numberToUint8Array(assetId),
        numberToUint8Array(qty),
        decodeAddress(receiver.addr).publicKey,
        numberToUint8Array(chain),
        numberToUint8Array(fee),
    ];
    let acTxn = makeApplicationCallTxnFromObject({
        from: sender.addr,
        appIndex: TOKEN_BRIDGE_ID,
        onComplete: OnApplicationComplete.NoOpOC,
        appArgs: args,
        foreignApps: [CORE_ID],
        foreignAssets: [assetId],
        accounts: accounts,
        suggestedParams: params,
    });
    acTxn.fee *= 2;
    txns.push(acTxn);
    signedTxns.push(acTxn.signTxn(sender.sk));
    const { txId } = await client.sendRawTransaction(signedTxns).do();
    const resp: Record<string, any> = await waitForConfirmation(
        client,
        txId,
        4
    );
    return parseSeqFromLog(resp);
}

export function createWrappedOnAlgorand(
    client: algosdk.Algodv2,
    sender: Account,
    attestVAA: Uint8Array
) {
    submitVAA(attestVAA, client, sender, TOKEN_BRIDGE_ID);
}

export function updateWrappedOnAlgorand(
    client: algosdk.Algodv2,
    sender: Account,
    vaa: Uint8Array
) {
    submitVAA(vaa, client, sender, TOKEN_BRIDGE_ID);
}

export function redeemOnAlgorand(
    vaa: Uint8Array,
    client: algosdk.Algodv2,
    acct: Account,
    tokenId: number
) {
    submitVAA(vaa, client, acct, tokenId);
}

/////////// These need to be written

export function getForeignAssetAlgorand() {
    // TODO:
}

export function getIsTransferCompletedAlgorand() {
    // TODO:
}

export function getIsWrappedAssetAlgorand() {
    // TODO:
}

export function hexToNativeString() {
    // TODO:
}

export function nativeToHexString() {
    // TODO:
}

export async function transferFromAlgorand(
    client: algosdk.Algodv2,
    sender: Account,
    assetId: number,
    quantity: number,
    receiver: Account,
    chain: number,
    fee: number
) {
    // TODO:
    const sid: bigint = await transferAsset(
        client,
        sender,
        assetId,
        quantity,
        receiver,
        chain,
        fee
    );
    // print("... track down the generated VAA")
    const vaa = await getVAA(client, sender, sid, TOKEN_BRIDGE_ID);
    // print(".. and lets pass that to player3")
    // vaaLogs.append(["transferFromAlgorand", vaa])
    // #pprint.pprint(vaaLogs)
    submitVAA(vaa, client, sender, TOKEN_BRIDGE_ID);
}
