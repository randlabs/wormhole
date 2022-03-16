// Algorand.ts

import { id, keccak256 } from "ethers/lib/utils";
import algosdk, {
    assignGroupID,
    computeGroupID,
    decodeAddress,
    getApplicationAddress,
    LogicSigAccount,
    makeApplicationCallTxnFromObject,
    makeApplicationOptInTxnFromObject,
    makeAssetCreateTxnWithSuggestedParamsFromObject,
    makePaymentTxnWithSuggestedParams,
    makePaymentTxnWithSuggestedParamsFromObject,
    OnApplicationComplete,
    signLogicSigTransaction,
    Transaction,
} from "algosdk";
import {
    hexStringToUint8Array,
    PopulateData,
    TmplSig,
    uint8ArrayToHexString,
} from "./TmplSig";
import { VaaVerifyTealSource } from "./VaaVerifyTealSource";

// Some constants
export const ALGO_TOKEN =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const KMD_ADDRESS: string = "http://localhost";
export const KMD_PORT: number = 4002;
export const KMD_WALLET_NAME: string = "unencrypted-default-wallet";
export const KMD_WALLET_PASSWORD: string = "";
export const ALGOD_ADDRESS: string = "http://localhost";
export const ALGOD_PORT: number = 4001;
export const CORE_ID: number = 4;
export const TOKEN_BRIDGE_ID: number = 6;
export const SEED_AMT: number = 1002000;
const MAX_KEYS: number = 16;
const MAX_BYTES_PER_KEY: number = 127;
const BITS_PER_BYTE: number = 8;

const BITS_PER_KEY: number = MAX_BYTES_PER_KEY * BITS_PER_BYTE;
const MAX_BYTES: number = MAX_BYTES_PER_KEY * MAX_KEYS;
const MAX_BITS: number = BITS_PER_BYTE * MAX_BYTES;
const COST_PER_VERIF: number = 1000;
const WALLET_BUFFER: number = 200000;
const MAX_SIGS_PER_TXN: number = 9;

// Generated Testnet wallet
export const TESTNET_ACCOUNT_ADDRESS =
    "RWVYXYLSV32QIHFUMBEBW4BQZR7FDVJGKTVZIVYECMQWU7CZUAK5Q4WMP4";
export const TESTNET_ACCOUNT_MN =
    "enforce sail meat library retreat rain praise run floor drastic flat end true olympic boy dune dust regular feed allow top universe borrow able ginger";

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

export class Account {
    pk: Buffer;
    addr: string;
    mn: string;

    constructor(address: string, privateKey: Buffer) {
        this.pk = privateKey;
        this.addr = address;
        this.mn = algosdk.secretKeyToMnemonic(privateKey);
    }

    getPrivateKey(): Buffer {
        return this.pk;
    }
    getAddress(): string {
        return this.addr;
    }
    getMnemonic(): string {
        return this.mn;
    }
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

export function pgmNameToHexString(name: string): string {
    const enc: TextEncoder = new TextEncoder();
    const bName: Uint8Array = enc.encode(name);
    const sName: string = uint8ArrayToHexString(bName, false);
    return sName;
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
    return balances;
}

export async function attestFromAlgorand(
    client: algosdk.Algodv2,
    senderAcct: Account,
    assetId: number
    //    appId: number
): Promise<string> {
    const appIndex: number = 0; // appIndex is 0 for attestations
    const tbAddr: string = getApplicationAddress(TOKEN_BRIDGE_ID);
    const decTbAddr: Uint8Array = decodeAddress(tbAddr).publicKey;
    const aa: string = uint8ArrayToHexString(decTbAddr, false);
    const emitterAddr: string = await optin(client, senderAcct, CORE_ID, 0, aa);
    const acctInfo = await client
        .accountInformation(senderAcct.getAddress())
        .do();
    let creatorAddr = acctInfo["created-assets"]["creator"];
    const creatorAcctInfo = await client.accountInformation(creatorAddr).do();
    const PgmName: string = "attestToken";
    const encoder: TextEncoder = new TextEncoder();
    const bPgmName: Uint8Array = encoder.encode(PgmName);
    const wormhole: boolean = creatorAcctInfo["auth-addr"] === tbAddr;
    if (!wormhole) {
        console.log("Not wormhole.  Need to optin...");
        const natName: string = "native";
        const enc: TextEncoder = new TextEncoder();
        const bNatName: Uint8Array = enc.encode(natName);
        const sNatName: string = uint8ArrayToHexString(bNatName, false);
        creatorAddr = await optin(
            client,
            senderAcct,
            TOKEN_BRIDGE_ID,
            appIndex,
            sNatName
        );
    }
    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();
    console.log("Making app call txn...");
    const appTxn = makeApplicationCallTxnFromObject({
        appArgs: [bPgmName, numberToUint8Array(assetId)],
        accounts: [creatorAddr, creatorAcctInfo["address"], emitterAddr],
        appIndex: TOKEN_BRIDGE_ID,
        foreignApps: [CORE_ID],
        foreignAssets: [assetId],
        from: senderAcct.getAddress(),
        onComplete: OnApplicationComplete.NoOpOC,
        suggestedParams: params,
    });
    const rawSignedTxn = appTxn.signTxn(senderAcct.getPrivateKey());
    console.log("rawSignedTxn:", rawSignedTxn);
    const tx = await client.sendRawTransaction(rawSignedTxn).do();
    // wait for transaction to be confirmed
    const ptx = await algosdk.waitForConfirmation(client, tx.txId, 4);

    return tx.txid;
}

export async function accountExists(
    client: algosdk.Algodv2,
    appId: number,
    acctAddr: string
): Promise<boolean> {
    try {
        const acctInfo = await client.accountInformation(acctAddr).do();
        console.log("acctInfo:", acctInfo);
        const als: Record<string, any>[] = acctInfo["apps-local-state"];
        console.log("als:", als);
        if (!als) {
            return false;
        }
        als.forEach(function (app) {
            console.log("Inside for loop");
            if (app["id"] === appId) {
                return true;
            }
        });
    } catch (e) {
        console.error("Failed to check for account existence:", e);
        return false;
    }
    console.log("returning false");
    return false;
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
            from: sender.getAddress(),
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
        const signedSeedTxn = seedTxn.signTxn(sender.getPrivateKey());
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
            4
        );
    }
    console.log("optin done.");
    return sigAddr;
}

export function getLogicSigAccount(program: Uint8Array): LogicSigAccount {
    const lsa = new LogicSigAccount(program);
    return lsa;
}

function extract3(buffer: any, start: number, size: number): string {
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
    ret.set("chainRaw", extract3(vaa, off, 2));
    ret.set("chain", buf.readIntBE(off, 2));
    off += 2;
    ret.set("emitter", extract3(vaa, off, 32));
    off += 32;
    ret.set("sequence", buf.readBigUInt64BE(off));
    off += 8;
    ret.set("consistency", buf.readIntBE(off, 1));
    off += 1;

    ret.set("Meta", "Unknown");

    if (
        Buffer.from(vaa, off, 32) ===
        Buffer.from(
            "000000000000000000000000000000000000000000546f6b656e427269646765"
        )
    ) {
        ret.set("Meta", "TokenBridge");
        ret.set("module", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("action", buf.readIntBE(off, 1));
        off += 1;
        if (ret.get("action") === 1) {
            ret.set("Meta", "TokenBridge RegisterChain");
            ret.set("targetChain", buf.readIntBE(off, 2));
            off += 2;
            ret.set("EmitterChainID", buf.readIntBE(off, 2));
            off += 2;
            ret.set("targetEmitter", Buffer.from(vaa, off, 32));
            off += 32;
        } else if (ret.get("action") === 2) {
            ret.set("Meta", "TokenBridge UpgradeContract");
            ret.set("targetChain", buf.readIntBE(off, 2));
            off += 2;
            ret.set("newContract", Buffer.from(vaa, off, 32));
            off += 32;
        }
    } else if (
        Buffer.from(vaa, off, 32) ===
        Buffer.from(
            "00000000000000000000000000000000000000000000000000000000436f7265"
        )
    ) {
        ret.set("Meta", "CoreGovernance");
        ret.set("module", Buffer.from(vaa, off, 32));
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
        ret.set("Contract", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("FromChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("Decimals", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Symbol", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("Name", Buffer.from(vaa, off, 32));
    }

    if (Buffer.from(vaa, off).length === 133 && buf.readIntBE(off, 1) === 1) {
        ret.set("Meta", "TokenBridge Transfer");
        ret.set("Type", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Amount", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("Contract", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("FromChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("ToAddress", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("ToChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("Fee", Buffer.from(vaa, off, 32));
    }

    if (buf.readIntBE(off, 1) === 3) {
        ret.set("Meta", "TokenBridge Transfer With Payload");
        ret.set("Type", buf.readIntBE(off, 1));
        off += 1;
        ret.set("Amount", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("Contract", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("FromChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("ToAddress", Buffer.from(vaa, off, 32));
        off += 32;
        ret.set("ToChain", buf.readIntBE(off, 2));
        off += 2;
        ret.set("Fee", Buffer.from(vaa, off, 32));
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

    let ret = "";
    if (app_state) {
        const e = Buffer.alloc(127);
        // let vals = {};
        const vals: Map<number, Buffer> = new Map<number, Buffer>();
        console.log(app_state);
        for (const kv of app_state) {
            const key: number = Buffer.from(kv["key"], "base64").readInt8();
            const v: Buffer = Buffer.from(kv["value"]["bytes"], "base64");
            if (Buffer.compare(v, e)) {
                // vals[key] = v;
                vals.set(key, v);
            }
        }
        for (const k in Object.keys(vals)) {
            // ret += vals[k];
            ret += vals.get(parseInt(k));
        }
    }
    return hexStringToUint8Array(ret);
}

export async function compileTeal(
    client: algosdk.Algodv2,
    tealSource: string
): Promise<TealCompileRsp> {
    const response = await client.compile(tealSource).do();
    return { hash: response.hash, result: response.result };
}

export async function submitVAA(
    vaa: Uint8Array,
    client: algosdk.Algodv2,
    sender: Account,
    appid: number
) {
    // A lot of our logic here depends on parseVAA and knowing what the payload is..
    const parsedVAA: Map<string, any> = parseVAA(vaa);
    const seq: number = parsedVAA.get("sequence") / MAX_BITS;
    const chainRaw = parsedVAA.get("chainRaw"); // TODO: add the .hex()
    const em = parsedVAA.get("emitter"); // TODO: add the .hex()
    const index = parsedVAA.get("index");
    const seqAddr: string = await optin(
        client,
        sender,
        appid,
        seq,
        chainRaw + em
    );
    const guardianPgmName = pgmNameToHexString("guardian");
    // And then the signatures to help us verify the vaa_s
    const guardianAddr: string = await optin(
        client,
        sender,
        CORE_ID,
        index,
        guardianPgmName
    );
    let accts: string[] = [seqAddr, guardianAddr];
    // If this happens to be setting up a new guardian set, we probably need it as well...
    if (
        parsedVAA.get("Meta") === "CoreGovernance" &&
        parsedVAA.get("action") === 2
    ) {
        const ngsi = parsedVAA.get("NewGuardianSetIndex");
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
    if (
        meta === "TokenBridge Attest" ||
        meta === "TokenBridge Transfer" ||
        meta === "TokenBridge Transfer With Payload"
    ) {
        let chainAddr: string;
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
                pgmNameToHexString("native")
            );
        }
        accts.push(chainAddr);
    }
    const keys: Uint8Array = await decodeLocalState(
        client,
        CORE_ID,
        guardianAddr
    );
    const params: algosdk.SuggestedParams = await client
        .getTransactionParams()
        .do();
    let txns = [];

    // Right now there is not really a good way to estimate the fees,
    // in production, on a conjested network, how much verifying
    // the signatures is going to cost.

    // So, what we do instead
    // is we top off the verifier back up to 2A so effectively we
    // are paying for the previous persons overrage which on a
    // unconjested network should be zero

    let pmt: number = 3 * COST_PER_VERIF;
    const vaaVerifyResult: TealCompileRsp = await compileTeal(
        client,
        VaaVerifyTealSource
    );
    const balances = await getBalances(client, vaaVerifyResult.hash);
    let bal: number | undefined = balances.get(0);
    if (!bal) {
        throw new Error("undefined balance");
    }
    if (WALLET_BUFFER - bal >= pmt) {
        pmt = WALLET_BUFFER - bal;
    }

    const payTxn = makePaymentTxnWithSuggestedParamsFromObject({
        from: sender.getAddress(),
        to: vaaVerifyResult.hash,
        amount: pmt * 2,
        suggestedParams: params,
    });
    txns.push(payTxn);

    // We don't pass the entire payload in but instead just pass it pre digested.  This gets around size
    // limitations with lsigs AND reduces the cost of the entire operation on a conjested network by reducing the
    // bytes passed into the transaction
    // This is a 2 pass digest
    const digest = keccak256(keccak256(parsedVAA.get("digest")));

    // How many signatures can we process in a single txn... we can do 9!
    // There are likely upwards of 19 signatures.  So, we ned to split things up
    // const bsize: number = 9 * 66;
    // const numBlocks: number = parsedVAA.get("signatures").length / bsize + 1;
    const numSigs: number = parsedVAA.get("siglen");
    let numTxns: number = numSigs / MAX_SIGS_PER_TXN;
    if (numSigs % MAX_SIGS_PER_TXN) {
        numTxns++;
    }
    const SIG_LEN: number = 66;
    const signatures: Uint8Array = parsedVAA.get("signatures");
    const verifySigArg: Uint8Array = hexStringToUint8Array(
        pgmNameToHexString("verifySigs")
    );
    for (let nt = 0; nt < numTxns; nt++) {
        let sigs: Uint8Array = signatures.slice(nt * SIG_LEN);
        if (sigs.length > SIG_LEN) {
            sigs = sigs.slice(0, SIG_LEN);
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
            const key = keys.slice(idx * GuardianKeyLen + 1, 20);
            keySet.set(key, i * 20);
        }

        const appTxn = makeApplicationCallTxnFromObject({
            appArgs: [
                verifySigArg,
                sigs,
                keySet,
                hexStringToUint8Array(digest),
            ],
            accounts: accts,
            appIndex: CORE_ID,
            from: vaaVerifyResult.hash,
            note: parsedVAA.get("digest"),
            onComplete: OnApplicationComplete.NoOpOC,
            suggestedParams: params,
        });
    }
}
