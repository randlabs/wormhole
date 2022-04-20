import { describe, expect, jest, test } from "@jest/globals";
import {
    hexStringToUint8Array,
    PopulateData,
    TmplSig,
    uint8ArrayToHexString,
} from "../TmplSig";
import getSignedVAAWithRetry from "../../rpc/getSignedVAAWithRetry";
import { setDefaultWasm } from "../../solana/wasm";
import {
    ETH_NODE_URL,
    ETH_PRIVATE_KEY,
    ETH_TOKEN_BRIDGE_ADDRESS,
    WORMHOLE_RPC_HOSTS,
} from "../../token_bridge/__tests__/consts";
import algosdk, {
    Account,
    Algodv2,
    decodeAddress,
    getApplicationAddress,
    makeApplicationCallTxnFromObject,
    OnApplicationComplete,
    waitForConfirmation,
} from "algosdk";
import {
    accountExists,
    attestFromAlgorand,
    CORE_ID,
    getAlgoClient,
    getBalances,
    getIsTransferCompletedAlgorand,
    getMessageFee,
    getVAA,
    optin,
    parseVAA,
    simpleSignVAA,
    submitVAA,
    textToUint8Array,
    TOKEN_BRIDGE_ID,
    transferAsset,
    transferFromAlgorand,
} from "../Algorand";
import { createAsset, getTempAccounts } from "../Helpers";
import { TestLib } from "../testlib";
import {
    CHAIN_ID_ALGORAND,
    CHAIN_ID_ETH,
    hexToUint8Array,
    nativeToHexString,
} from "../../utils";
import { getSignedVAA } from "../../rpc";
import { NodeHttpTransport } from "@improbable-eng/grpc-web-node-http-transport";
import { ethers } from "ethers";
import {
    createWrappedOnEth,
    getIsTransferCompletedEth,
    redeemOnEth,
    updateWrappedOnEth,
} from "../../token_bridge";

setDefaultWasm("node");

jest.setTimeout(60000);

// TODO: setup keypair and provider/signer before, destroy provider after
// TODO: make the repeatable (can't attest an already attested token)

describe("Integration Tests", () => {
    describe("Algorand tests", () => {
        test("Test TmplSig populate()", (done) => {
            console.log("Starting TmplSig test...");
            (async () => {
                // 'contract': '0620010181004880220001000000000000000000000000000000000000000000000000000000000000000448880001433204810312443300102212443300088190943d124433002032031244330009320312443301108106124433011922124433011881df0412443301203203124433021022124433020881001244330220802050b9d5cd33b835f53649f25be3ba6e6b8271b6d16c0af8aa97cc11761e417feb1244330209320312442243',
                // 'TMPL_ADDR_IDX': 0,
                // 'TMPL_APP_ADDRESS': '50b9d5cd33b835f53649f25be3ba6e6b8271b6d16c0af8aa97cc11761e417feb',
                // 'TMPL_APP_ID': 607,
                // 'TMPL_EMITTER_ID': '00010000000000000000000000000000000000000000000000000000000000000004',
                // 'TMPL_SEED_AMT': 1002000

                const client: algosdk.Algodv2 = getAlgoClient();
                const tmplSig: TmplSig = new TmplSig(client);
                let data: PopulateData = {
                    addrIdx: 0,
                    appAddress:
                        "50b9d5cd33b835f53649f25be3ba6e6b8271b6d16c0af8aa97cc11761e417feb",
                    appId: 607,
                    emitterId:
                        "00010000000000000000000000000000000000000000000000000000000000000004",
                    seedAmt: 1002000,
                };
                try {
                    //  Unit test for the TmplSig::populate() function
                    const lsa = await tmplSig.populate(data);
                    const byteCode: string = uint8ArrayToHexString(
                        lsa.toByte(),
                        false
                    ).slice(22);
                    console.log(
                        "lsa.toByte():",
                        uint8ArrayToHexString(lsa.toByte(), false).slice(22)
                    );
                    expect(byteCode).toEqual(
                        "0620010181004880220001000000000000000000000000000000000000000000000000000000000000000448880001433204810312443300102212443300088190943d124433002032031244330009320312443301108106124433011922124433011881df0412443301203203124433021022124433020881001244330220802050b9d5cd33b835f53649f25be3ba6e6b8271b6d16c0af8aa97cc11761e417feb1244330209320312442243"
                    );
                    // End TmplSig::populate() test
                } catch (e) {
                    console.error("TmplSig error:", e);
                }
                console.log("Finished TmplSig test...");
                done();
            })();
        });
        test("Test optin", (done) => {
            console.log("Starting optin test...");
            (async () => {
                try {
                    const CORE_ID: number = 4;
                    const TOKEN_BRIDGE_ID: number = 6;
                    const client: algosdk.Algodv2 = getAlgoClient();
                    // Create a wallet
                    const tempAccts: Account[] = await getTempAccounts();
                    const numAccts: number = tempAccts.length;
                    expect(numAccts).toBeGreaterThan(0);
                    const wallet: Account = tempAccts[0];
                    const tbAddr: string =
                        getApplicationAddress(TOKEN_BRIDGE_ID);
                    const decTbAddr: Uint8Array =
                        decodeAddress(tbAddr).publicKey;
                    const aa: string = uint8ArrayToHexString(decTbAddr, false);
                    const emitterAddr: string = await optin(
                        client,
                        wallet,
                        CORE_ID,
                        0,
                        aa,
                        "emitterAddr"
                    );
                    console.log("emitter address:", emitterAddr);
                } catch (e) {
                    console.error("optin error:", e);
                }
                done();
            })();
        });
        test("Test parseVAA", (done) => {
            (async () => {
                try {
                    // This VAA is carrying a Pyth price payload
                    const pppVAA: string =
                        "01000000000100878efed6e1e829ef2d2b38b3e4442af7d52b15152d9a137104af59dc50bd6fa90111c3cfb37f49daf7ae5da1f7a70666ef59ed43b1802b9a86d8d916593a8bcd00620a4ecb000000010001f346195ac02f37d60d4db8ffa6ef74cb1be3550047543a4a9ee9acf4d78697b0000000000000d629205032574800020200050096503257480002011dc9fc22544655b453008cc68559639a8f74d584d94f84ac945b36c957afd9db73dc009953c83c944690037ea477df627657f45c14f16ad3a61089c5a3f9f4f201000000000630a010fffffff8000000000623c88e000000009fbfbc1f000000009b155c1f00000000000127a100000000755eafbc000000009b155c1f000000000000c350010000000000620a4ecb503257480002010264e3935b6fb12d2c5d92d75adb8175ca5b454c7d7ec279b0d27647ee0fd33f08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c73180100000000054a37b0fffffff8000000000541380d00000000a138fc3f00000000b6dfdb3f000000000000fd5600000000769a3b9c00000000b6dfdb3f000000000000c350010000000000620a4ecb50325748000201e0b43fa07b9318a2de306080fc8946494ae30c6af9b12b4dc99f1847718e6341afcc9a5bb5eefd55e12b6f0b4c8e6bccf72b785134ee232a5d175afd082e8832010000000001011868fffffffb00000000010233e2000000005821445f000000003414d83d00000000000054850000000070b122fc000000003414d83d000000000000848d000000000000620a4ecb50325748000201101be52cc7068adf747f67759e86b478c6e90f81b05a8121d080cfa0a5a9a0736de025a4cf28124f8ea6cb8085f860096dbc36d9c40002e221fc449337e065b2010000000137791750fffffff8000000013567604800000001450fc47f000000003e9efade00000000001cc89e0000000076204e7c000000003e9efade000000000026e8f0010000000000620a4ecb50325748000201a4b430a1ce2c68685e0c0e54a60340854fe15ce154e2f0b39927968e447cf93b1fc18861232290221461220bd4e2acd1dcdfbc89c84092c93c18bdc7756c1588010000000005f67d40fffffff80000000005f67804000000018773c2df00000001874d089f0000000000007513000000007547c2fc00000001874d089f0000000000007530010000000000620a4ecb";
                    // convert string to Uint8Array
                    const hexPppVAA: Uint8Array = hexStringToUint8Array(pppVAA);
                    const parsedPppVAA: Map<string, any> = parseVAA(hexPppVAA);
                    console.log("parsed VAA:", parsedPppVAA);

                    //
                    //  guardianUpgrade VAA:
                    const gUpgradeVAA: string =
                        "010000000113006a0fd5b12c71afea701d8cf2bf13aed7511b6f1e239b26a28e2635fe5a68af1902f1eec1e085c754cbebdfb5262f78287e7d110d25cd4ad6504bc36e776d5f4d0001500b3dec9b3c712ea9cf40070ef8616f73966f26845894d796ef2a94a42396121192ceb8cca26c575f648d1b384e9d21689751c73295c424a93a4ac2094c57e70102752dce8a19611490b84e80606a40286cb45bbaea2a8f818a8c9c46e763528de971d45d7aabfafda92e494e120f9d478b7eeecb9c654509f0351f22645f90c83100034966869ea35c27670a4993fba23d8c3e7dc7868c956ec4f78069145e1598c5e96b29894ef82b8a7000bf7e17c6a2c125aaca5fae9c1af30e617d0a3b25e562c20004c51abb12086b1dba7cf129e463fcf4bd0d42720abfd0ac93da2bbc5335496f5a18cb952ad9688c0c91ac083e22df5a4cb55470d6bf107ef1d741698b2a6093c20105e97e64fb124345a9feb9a715b701cfbb3a828d0917f255a94e45a11bcc5ed200049a062a686f202a6e1d8cd3424c5d47d0b2cf302094eef25421ca403a68099c010677a8989bc4eefe4ca35d0944077da1a8b751cc27ac1d8075187438d38c3c7dda28fab818efdc8b9514c3b753d23f2ef58af1dcff743d22cebe4baa3fdd2ace8401072bb8f606278bd301d5c43172626d66bd475f74f5d1966f364b6e2a66e587c94c7f5ddd2710bff83337c88920b9207e1ccbb34aeaf20707bf5ede700bc2a245470008e798887c16ead032eac3a9002a306dfd3650432be1ee2023c673aaec1cde884642cb728ca67e27d10df4fb8bad8e0d1590894e2e4f2e69930c380d7476c0fcc400098bee13bd73fe668d66caea447de67a243f45832b4144070716def14f45b3c39733caa04f0f2feeab698de2b938539c6236239f9753b433a8989e33205a20ce9e010aad6dbe3e46e9bc7b49d6a9cd5efd87c4ec4f478847b197695d553b12c0354999282413948e6515039f19ed5298724ddea9a013a14de68246cc0dbf0412b7b5cd010b2f48337c8a4b09e20bede3fca7c05adfe3c9051eb24651e759daa4a20c701f8363ed7a206faf61880e50c0b2c6167b844cb4ee995750255335cc10a05bf9c75f010c5dbcca21cd3bc92b7d24c25de3ee49eadcc314df34cc2a577a3a9960c13f6317291598fd6b73aebbb24af51d916870757fd8193d8d7b2799e8cdeb0fe3d47433000de95a94e0a4b72c471c92b699fa70b25f70db10e7bac3910eaea5a2b60b7ba13a5b0328ab4d3256452b426a761a2aa919d2695f852d4a6134c733530fce9ab84e000e780ebd790827b19ec30beb6a079d530ace0a98b11378ed9b86af99d7ca1f4b0b2c789574fe59b66648196350b1165916e4067185d6ec3b0a7c715a1efe5c5265000f87d2137693af524bf9aebc735e386bf2a8f3ed383ebeb6ffe0c17652ee59d88b19ad688b0270451269217efb5a0f23047627a8ee21862a77a5bf9ca55c53cde50010eaa77d3646bd79b549ce6919266fd7a9e0f64a2faaa5d61965c1f57bbd41ea4264b1fdf4abcb4e396feccdaf4193b8691119f8b2807a020a8badfb64546ddf94011135252460395af21ada39a775a3c48feb1c2462dfea215f96b974e6c27ac1233e517201697e519ca58a79d27227ef37c1a35997f377825ab6452a2f399287b6c2011229ebc2abc2be958ca1bb0551a1ae4cd9420c17289f9885ece52309f0766034000615684bf8d3ce0d217e8060a60e1940bca6f726dc1564c1467d719a6dcf58e60062319c37000000020001000000000000000000000000000000000000000000000000000000000000000400000000000000022000000000000000000000000000000000000000000000000000000000436f7265020000000000021352a26ce40f8caa8d36155d37ef0d5d783fc614d2389a74e8ffa224aead0778c786163a7a2150768cb4459ea6482d4ae574305b239b4f2264239e7599072491bd66f63356090c11aae8114f5372abf12b51280ea1fd2b0a1c76ae29a7d54dda68860a2bfffa9aa60cff05e20e2ccaa784ee89a0a16c2057cbe42d59f8fcd86a1c5c4ba351bd251a5c5b05df6a4b07ff9d5ce1a6ed58b6e9e7d6974d1babec087ec8306b84235d7b0478c61783c50f990bfc44cfc0c8c1035110a13fe788259a4148f871b52babcb1b58a2508a20a7198e131503ce26bbe119aa8c62b28390820f04dda22afe03be1c3bb10f4ba6cf94a01fd6e97387c34a1f36de0f8341e9d409e06ec45b255a41fc2792209cb998a8287204d40996df9e54ba663b12dd23fbf4fbac618be140727986b3bbd079040e577ac50486d0f6930e160a5c75fd1203c63580d2f00309a9a85effaf02564fc183c0183a963869795913d3b6dbf3b24a1c7654672c69a23c351c0cc52d7673c52de99785741344662f5b2308a0";
                    const hexGUVAA: Uint8Array =
                        hexStringToUint8Array(gUpgradeVAA);
                    const parsedGUVAA: Map<string, any> = parseVAA(hexGUVAA);
                    console.log("Parsed Guardian Upgrade VAA:", parsedGUVAA);
                    //
                    //  registerChain VAA:
                    const regChainVAA: string =
                        "01000000021300d655215e841c8402dd5a5a59cde64d1cdcf4d630794a950572154c419445bd6b0b55a2867128dbdb07a8af7023586c07ee4c2343b436fd4a7bae4c00175eee89010139205169195a576f34f840f5efec49a0c8cfcb15889b8fa7612260444bef8bdc0fd274edfc7c6a3ae9d3f0f560fe39dee3cb2cef578c4acde75d4524c9569c52010204242bf606b8ebd8bba252e9e37e0f3352c044367f8f58c681164cbd024563e604f7836a59e04713c3c351540eb84514bee8983aac088b565bdeb1588facbf240103f334f37f6054f6b35e10531377f9b60dd0ed8153333fd1ac1577ca7f9f849c092c78f980d474947227fc543ea4b8e0a0156dce70024ae123852b6569a972bc3f0004190eaa4d1d635d74563163061a7febab0f560ea5ef772e9b499abbcc8198641e152b9872e395667c3469457ea7b13474597f571a8dd43198ebf924c4d81f6860000590106ff897e2808d3e6591a2939f597855cb8b9edf9b6cf01c571d06d1015bcd43dcc26384167c09ba110a414fc0a37137bcbf8378b7da55e58c86eec2425e9e0106c6658a3ecb9355b4e4699316918903f2b51ea36c5e9eec7d2243c930b16885056e4c9b60bef18c8f311abfac9b4993ca5a5a5563ef70d8ed4643e8a0294a7cee010726d4b97eb4280a87028fb4246ac91e2278045ce9727ac960b45aa0f2f125efe72f8ecc3d5378cb5974575d1ee292595bbcac71237fe25d194bf28ee64a6ed6d30108dc8377d7ae5f922a004f85124f63afc4559a8b29446612e09bb4e22d3e8e1603286d2264aee4745803da7010505c243523593045d0b814cbfbb7a703d92c2aaf000927757c0421497409138a184ba6405fcf669abee706f2d6dce525460f9926f1e0234d420062e95d69e72253898ec7a9bd54a31b09a67a5e6a3080da419102229e010af7b9de76c6be33ac09227a8067b4e82fcae95f1919f4ed8f902b1a735cc3ebc27e217e96c76662b9d5cd614f0cf78b283e5088ecfb939c7556601bcfecf6a6c3000b1574118db342f783559846872ec5f99347b959ab39c934ab40f4285320243de351e2cf6edf7596249cb4a33a2132200f48ee351a9c4d3ab2cedc052994d8702b010cf6944222b35d390b71a6eb09bc96ccac5cef9e7dcae7604e8db11cb050c59f3514acfb6ec06fce2814c8d7509cd24d4225c2cb0666ea879ddabc86e8946d84d6010d5cccc13fa483890fb5ac0d2929d105d7f8c7aa0f9d8c4ef2e7fed502ae02505f1553d7be46ea8c86aa1ecd6106d48cf3b0e38465dc47af137f72d302c71fb623000e44bf3f46476f30e240468592f23877774b775e16d1182e5df6aea08301f716283b8517673e2a295170dc3810b50831d29617c440aff68702e0d94a95d22dee3a010f95b05c152c60079b1b056638ab61a26452b04d44dacd0bba36d7c65a462b27720f97bb310303e320ef75ab043dd80a2fb1e4869f16689665bf076dcf754be84501105c6a4901e6ead756e6a796d6209cf830fe90acf186aa792297f75b751d13accf4004351ec3d6e49ea795be260112be51cf050a49b4213fb4467ba6e5bd8e4ce10011ab3b325b996897ab7fa7231c5eb8f04533fc1acec6429ad2cbd66a1c8e5b916f1775371411be693eb1fef8a89ec60086ca600a7fff8ffe3fc328aba62e84caaa0012f672dda335d096b2a873ce05c9b6b0759282475900678efc7b3b36a5d3fa3cab7fd4165345f61753376f039aa9207ab263786831d82206bf00f7bbb78b7c3fe80162319c3a0000000400010000000000000000000000000000000000000000000000000000000000000004000000000000000420000000000000000000000000000000000000000000546f6b656e42726964676501000000020000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585";
                    const hexRCVAA: Uint8Array =
                        hexStringToUint8Array(regChainVAA);
                    const parsedRCVAA: Map<string, any> = parseVAA(hexRCVAA);
                    console.log("Parsed Register Chain VAA:", parsedRCVAA);
                    //
                    //  createWrappedOnAlgorand VAA:
                    const createWrapVAA: string =
                        "010000000213001169470caf4d5f7a27049c1852e6429c0fa7db56584e1514b8cc3d7242b7710f5d15600562f068cd5bb0d515bd038929b62f14396730d06e99c6a7e14025a62900015157522a094c006c8ceb4b2a8b6e5bfaa613663f34d9ce534d4e4b5f581c720b21eb96062324eac0e9b28cf526698cc70b013436f6341312bc3dc2cd2c5e3b6f0102f1c5fcf6b6df200dbaedb7a923b244fd4563ce727b17d39f27c7fd3b9fb5c76e27f827779e47c98c0fb82bb59c40009d94afc68cec2066e6765292d5274399e20003bd48cbcf25a2ae733077f719f48812dcb5db45551308f98281839f9d1b5ebb2728ad199925b5451a2ac90caaf19eb9f8dbf83880cddd4380ccbd7556f3776beb010460d01f541b5c8664e8163db5ff67e553115a5adbe977e896e00bfe558f15e75771eb6e334827f42738120ff474597770b1dd843ae7bae96e2ebc2b2f111ff3850005577275e235cdc0e95e08b3efa44fd8085551b6f7b59aa0f7f091bf7002bcb9480d6be6196bac66f270a1018a5388b8174548a425c624bb65f06b0a0b2f41ba5c01064e9637c161de6e8588fe50022f4da14726733be790b84cce174a80e5142e17a6266381aa2b84fa3df7608430a5ba27aa188b2d389cbd0c73a4b64593d37bccc50007b70a66f4663afae8759c3639d8213e5094db416404b8058b32d10b42521b458b13d19e7ae8f5a4b9be2c47215d12037c74d5501bc5e1b1c5fa62957f8717e9d00108136ef73c58764c22391a8410e9811dd8a978f52b73c2564938357aab095e476761118053a09e0cad08735629360528ef4362823e1956833bcd8eda5482a03df801097ccf894c000cbc28587ab52627a7b8d05c2dc5434cda6f5cd55ae58e979cfb6e01303ad8ac1697dec213a5fbfeec6e77d483d09ee747a9de32618ea9dfc9a5f7010a1cc64605a4de382441c60a889d5a74f77b3328d9d8cd9e5b02ec69597f87cb60085f1cc6e4ffdb48f125c375c00d7e7d93804e9ea6b589f5a9e92bed9dfdca14000b9330b10a041438d52ccfe3b64bf4fd3a5ea5686b755f356d26d954e86b4384a1523b6e469fc61880324a0774650a5eb6502d677c11457a37674cca0cda76f688000cf1c276efcf8662bd0d59d1ca33ebe08121c76e31b0d74620bce9102ae02a078b4a52f8d626a71c4e5ce43b6524424594d8d0c70eb7cc01cc7ea734e48e85797d010d5a2617b7894ac14e15df109101e2779f6dc6027820613e2f4501a26ca850684a05785d7e02372a8184821cfc23d22ddec4631f2574d1338cafb963a58e1503dc010e674380d092aa52e8f6e237cba930551d9d7493427f9958e59d32eb796ab76a2140ca698e78a7198399935a5a73d5c8e363087f3f8f49722b237e455a15554af3000fcb79ea3c70a75238f841f7c539bfb3ab8c00b539ed9f72b92b26b0edcaf6211a298812b07e52fb9a3a4d1c52aec35453a9c65e48be569b4e6533a22c7d679060011004d7b9d453ddb5834bfb60564d673a1ed2b51aad9db321d72ab3e1089df778467bab44624e4aa2916585cfad0f42ba03b146a57cc40f61a2ea4862a700b7945c0011257311c376bab7646f83a81b85cc3e18545e5a980eef0d8e6a217861bdb34b18342148527c9018811a46a8e2eb38cb8ab25c66dd4d4a817cc031ff163d4f32eb0112d071f99d8b4cf54b034b2276ab76fd324965f9b9a35efc56109b99e637948c024c97988497b61d169eee4f27b649d6dbdc770452be51bc01315ce3f831c9ff000162319c3c000000080001ec7372995d5cc8732397fb0ad35c0121e0eaa90d26f828a534cab54391b3a4f5000000000000000820020000000000000000000000004523c3f29447d1f32aea95bebd00383c4640f1b40001085553444300000000000000000000000000000000000000000000000000000000436972636c65436f696e00000000000000000000000000000000000000000000";
                    const hexCWVAA: Uint8Array =
                        hexStringToUint8Array(createWrapVAA);
                    const parsedCWVAA: Map<string, any> = parseVAA(hexCWVAA);
                    console.log("Parsed Create Wrapped VAA:", parsedCWVAA);
                    //
                    //  redeemOnAlgorand VAA:
                    const redeemVAA: string =
                        "01000000011300d3f66cd953524cd3dd33396bdd24a6e5deb3df3c0404be778b4b939579212e1c66f479a85a3a00c812c775e58ca34878931d955d1939877e2a5e3c4419cd11960101c47a513100d6540304c245f310b6832eaf2477afce3bf2909ea5447732e6bcb651746141998c1de50306ee94eb65b711888c65a43a42528cee0be005151716360002c124c4012062c9b1cbf5f31ca551f50c553f7a97bbd0b1a50fe9e5d5589a7f101ca550bda30503b1b3bb4c092ef9a605ddfc0be08c3634c4b292399a54d63e4200032263333ae6daa49f05ec9deca9122755c9206bd72dfdac3d9c8dcdfb2db284b0265c77f9ee1b1c00e4f298869b1c492bff805045c0d0eef8fc3c0fdfbb82f01b0104a40415447bfadfffaf7d9bca8492dfc7c94dcc15e7ae3cc4f20cb34531ed17977e7711284010d71c868b69a87547b6faa09685aff8048cfc6fffc839d0be0b6a0105dfc1b0de5216abb57b524ce51f336060c3d1625ed28b55c5cd5cf1632c38f9c062f168f3d0f0838daf9c13a4ef48a8c159207045c3cb8e43d4a76baf591223c2000686180a55def6a45e8ea71595df89a69583c671a83e9e89bc5b73c55ed88c49fc5e32c47b8abdf1552bfc311d2dac988811f40c74eef3eb9437cf35b52d30239a0007b082d16d31d8e06d8ad494834b18d3b3d316a399b4d36bfb426e5b60ff81fd2e632da3466d2fa68fc0ec7bb0964cf969cd125966873ce52a1e846d4d8f0495440108487ff6b4956cea68fc8aa225ce47f93a15477f66db4362d0602d62a5b790428578253062d34b8c61665a6637572b095da9037025f426274f3ef40e7ecc493b5b0009b39dbed5560d5de7075fb43496e52b061313c6eb591ece2cde513de818881c30672e4fc180f6e3fbabf6a94813adb0d66a99b38ee27dfc71ad3fc4058c3c976e000a0bfd12ece2d2c845dc13293380784695e98e8ae598c3053426baaf65c9c962960271c8a69e52458f385be5617dde1b571d341a82112fe9aef1468140faebca00000bc0a81d0a8e9278011a0a4e0257401f35bcec9d98222ae2e9f44a39b6899d54551482f68c89040b60315a806c1f7cf18cb65bed3e18c8cf1059999e5107e720f2000c1939897f4dc63ec9ef38844ceb665caabab1f758a8543feff43b4bdd151dc6a56b93ff56d25fc4c0fe0c78d01df793fb4e3bdc2dea55f18694a40bc43dadc654010d1f41f8d5067eccdbf047180de85521ed3bbffd91ec2f157833e9514444d39e8c65c9f9897dcefc5e44469b080021e1715d85688369d24ae89b4858eaf2c89faf000e3310037efb7a37917725a6575f471427686d56e641bd4aa21394f8202f3f52db2f45fcb718ab4550a468bceed0c13ee8040c0da173caf87a7a5c1908f7270811000f6673460a92bce84565571f2b398f1692eb393adbf47b70bc60ca7755208aaf771010726fd66f2953a33fb472dbdcd91fb78b2993b279050d2d15b3b37c347c6e01108421b71f1568cf2f12d25bfbf2755561772c661a6f2cdeae02bbe8204fa8a53632536c4e580af27551a3304f2c87bff489b516e1d9570c1e203c8e0eea8c86520011186b2e2f0a42f554c604679085aeb7226ec2a9807d867ce51f40af5d58ce6a433981cd00f843b5223ebd764026c8a729c32ae92013dd27a8bed271d85a09733600127765a06677c2a9b060e15b361917eeefda093f3951fef93cb9787b05230dad9207635fee6f987a50202cbe3613da1f1e9c51ef09b885004d763da72403a231bd0062319c3e000000010001ec7372995d5cc8732397fb0ad35c0121e0eaa90d26f828a534cab54391b3a4f5000000000000000120010000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000004523c3f29447d1f32aea95bebd00383c4640f1b40001e6b2b620e5c346848e30a40310ef30a359b466148ab5c04f96e024e40de143ac00080000000000000000000000000000000000000000000000000000000000000000";
                    const hexRedVAA: Uint8Array =
                        hexStringToUint8Array(redeemVAA);
                    const parsedRedVAA: Map<string, any> = parseVAA(hexRedVAA);
                    console.log("Parsed Redeem VAA:", parsedRedVAA);
                    //
                    //  transferFromAlgorand VAA:
                    const transferVAA: string =
                        "01000000011300aec87f926f0d7bbe5c37dd580f5e94e7aa9ee8837741ce9a2964efae9f977dac79492e7ed5f84d489aa6d1f3d752c9febaf846589927d1dbe8cd69e7d01e9d44010156195e8b1383bf1d76e5c715f27caa7a6d29cf2aaf10c67eae3ecb855be013f500981e56c346c2122ff2a0a274745093adc6e263ca8b220649fdaedd041be47a0102aeb73afa6c75122d52666da208b1b29221ff5f894da8fd11f9d8ab9c9fee9f6e238231f4a48200637d29fe70b327f7b6cc536d326635d944e80aca84aaf2908000035612a27bb95f0e280502ea7d4631afd2b24d41428f22f58bcd5ba9477be4de8536ab20b4bad90f3f95f3303a1c116ca78c4cce9478c2769aaad74c04b53f17f40104b1fc79501049806997bc793694601566f5d56c3abf5ea3126b0c1c24a97e9e8e592ed505de471ad372f679beee35a5e467144627d72343834c5f96b1afa1b9b400050af609532bb0ea524a35a76c4a46dea2d6a31c545bbba705d99b42259acb77d90f19e2866d7dc12468691988291c154e900fc90d7b6f666ff9f63a66d163331100063bec6164adc6529b2f5d02c9a0da90d3656d4d9bb7a6f9b31f2c00e914d2001f3724cab7fb6a914ee2de2ef622c129e0ccf7a9d9784b6a70deff5cdb0c6bc8a50107179150acf55b02e0a12e484c8f274e411d82333428dfe06440ec7cf51373fc6f2fc5241225c06c8c3ad662ca236e07ce06fc4988c1e2620dcd07e977d3c872480008e476380cdcc35d61881e372f1b6643a8aaa577fdbfc253626997e38773185bf50ae33a4c6127b77369670718fa473a52d6b593e3cb3af479c451bdfeefcf2bd30009674551361eaaff891d590ca699d5b03504d866fe91a8118bb1681e0759edbfca1f2b358398d4d46e6916d9378bcab01e7ff21fd770e63222b2ef6a98c262d83e010a8ad0bc1d8eb89b4a8d7b119d62d737202895e3d80a0ca7367a21bd6587cc6aba0cdb19c089b03d622a1ad6a939ee285f78c3f52e87a81fa51d0fea7238280aba010b13857b3845216d66fe84985bd8d5a16b2440ea0a3e5afc43c19c802fe7c360dd5534c1df47e8ba0c5b4166e13becf5454ac3567fdbdcadcaf625d46ae7a188d7010c70e3859ea2d4c05769bfb72649f0266eef24e310558a7136d931161cafea91674cc3ded48c6715f3326e365ad862444cb867688b834ac12bf0b651d81764951e010dd03c3f06009a37a2c716259c1e86793a5bd9b9bab9cc3d2cc2983a766e87aeb275a9a9a047d81b57bb2b9b747138c391b77768a639b284e662ae5c15504d48a1000e9ccfade4aea4f1d5e1e053a32d1a93c39e855044a09cfd41f974f61986e42ab21d103c1c2c82a1cff1d2f0f79ad64ad8c214f88c1a84518bc6ad3656f827c6f0010f09ed95a03909d4a40041676a7f460c35ea7b9464a855a3aa1df9e2b4841e5ec42b08ca2c1f9997274b9f07120180e8d5b8eeceada584c79cbfc39d983b6dfaba00101c48e160de738770847abef02cdd0a3594dbc80de68403004f987e7676f954df2aa24e5280f5ecf5a61f865af1185220a805a64211b732e3672071801f75a86901117004184bcfa26f19efed445980f65e2450101bf20bb70d36c66e244bc10c1ff33aee94550a5af547e346ffd913335b33b374776b81d408b54dad046a18afcc9f0112420f47b6b5bd0c4b5c5e5c8db36e490c8d250e1e2087a7b43b63fac0f7f6bc6f28593877c492e27c560e39afcd8aa99847feb0193759be61fae2e8130a8993150062319c42002f37460008a8f52a34e2b19ac916d3cc27d3b07bfbfb03f31e0075a2a85ffe99be89d3887c00000000000000032001000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000006150008f888ac4b7756ad193876ff85decf58eaa82f5094d528d7cd9b3119737b1e8d2700080000000000000000000000000000000000000000000000000000000000000000";
                    const hexTxVAA: Uint8Array =
                        hexStringToUint8Array(transferVAA);
                    const parsedTxVAA: Map<string, any> = parseVAA(hexTxVAA);
                    console.log("Parsed Transfer VAA:", parsedTxVAA);
                    //
                } catch (e) {
                    console.error("parseVAA error:", e);
                    expect(false).toBe(true);
                }
                done();
            })();
        });
        test("Account exists", (done) => {
            (async () => {
                try {
                    console.log("Starting account exists...");
                    const client: algosdk.Algodv2 = getAlgoClient();
                    const tempAccts: Account[] = await getTempAccounts();
                    const numAccts: number = tempAccts.length;
                    expect(numAccts).toBeGreaterThan(0);
                    const wallet: Account = tempAccts[0];

                    const CORE_ID: number = 4;
                    const TOKEN_BRIDGE_ID: number = 6;
                    let acctExists: boolean = await accountExists(
                        client,
                        TOKEN_BRIDGE_ID,
                        wallet.addr
                    );
                    expect(acctExists).toBe(false);
                    acctExists = await accountExists(
                        client,
                        CORE_ID,
                        wallet.addr
                    );
                    expect(acctExists).toBe(false);

                    // TODO:  Find an account that exists somewhere for a true test.

                    const fee: number = await getMessageFee(client);
                    console.log("fee =", fee);
                } catch (e) {
                    console.error("Account exists error:", e);
                    expect(false).toBe(true);
                }
                done();
            })();
        });
        // test("Create and submit VAA", (done) => {
        //     (async () => {
        //         try {
        //             console.log("Create and submit VAA starting...");
        //             const client: algosdk.Algodv2 = getAlgoClient();
        //             const tempAccts: Account[] = await getTempAccounts();
        //             const d = new Date();
        //             const secs = Math.floor(d.getTime() / 1000);
        //             const nonce: number = 1;
        //             const myTestLib: TestLib = new TestLib();
        //             const upVaa = myTestLib.genGuardianSetUpgrade(
        //                 myTestLib.singleGuardianPrivKey,
        //                 0,
        //                 1,
        //                 nonce,
        //                 secs,
        //                 myTestLib.singleGuardianKey
        //             );
        //             console.log("upVAA:", upVaa);
        //             const vaa: Uint8Array = hexStringToUint8Array(upVaa);
        //             let isComplete: boolean =
        //                 await getIsTransferCompletedAlgorand(
        //                     client,
        //                     vaa,
        //                     CORE_ID,
        //                     tempAccts[0]
        //                 );
        //             expect(isComplete).toBe(false);
        //             const resp = await submitVAA(
        //                 vaa,
        //                 client,
        //                 tempAccts[0],
        //                 CORE_ID
        //             );
        //             console.log("resp:", resp);
        //             isComplete = await getIsTransferCompletedAlgorand(
        //                 client,
        //                 vaa,
        //                 CORE_ID,
        //                 tempAccts[0]
        //             );
        //             expect(isComplete).toBe(true);
        //         } catch (e) {
        //             console.error("Create and submit VAA error:", e);
        //             done();
        //             expect(false).toBe(true);
        //         }
        //         done();
        //     })();
        // });
        test.only("Algorand attestation", (done) => {
            (async () => {
                try {
                    console.log("Starting attestation...");
                    const CORE_ID: number = 4;
                    const TOKEN_BRIDGE_ID: number = 6;
                    const client: algosdk.Algodv2 = getAlgoClient();
                    const tempAccts: Account[] = await getTempAccounts();
                    const numAccts: number = tempAccts.length;
                    expect(numAccts).toBeGreaterThan(0);
                    const wallet: Account = tempAccts[0];

                    let accountInfo = await client
                        .accountInformation(wallet.addr)
                        .do();
                    console.log(
                        "Account balance: %d microAlgos",
                        accountInfo.amount
                    );

                    console.log("Creating fake asset...");
                    const assetIndex: number = await createAsset(wallet);
                    console.log("Newly created asset index =", assetIndex);
                    console.log("Testing attestFromAlgorand...");
                    const sn: BigInt = await attestFromAlgorand(
                        client,
                        wallet,
                        assetIndex
                    );
                    console.log("sn", sn);

                    // Now, try to send a NOP
                    console.log("Start of NOP...");
                    const suggParams: algosdk.SuggestedParams = await client
                        .getTransactionParams()
                        .do();
                    console.log("NOP1");
                    const nopTxn = makeApplicationCallTxnFromObject({
                        from: wallet.addr,
                        appIndex: TOKEN_BRIDGE_ID,
                        onComplete: OnApplicationComplete.NoOpOC,
                        appArgs: [textToUint8Array("nop")],
                        suggestedParams: suggParams,
                    });
                    console.log("NOP2");
                    const resp = await client
                        .sendRawTransaction(nopTxn.signTxn(wallet.sk))
                        .do();
                    console.log("resp", resp);
                    console.log("NOP3");
                    const response = await waitForConfirmation(
                        client,
                        resp.txId,
                        1
                    );
                    console.log("End of NOP");
                    // End of NOP

                    console.log("Getting emitter address...");
                    const tbAddr: string =
                        getApplicationAddress(TOKEN_BRIDGE_ID);
                    const decTbAddr: Uint8Array =
                        decodeAddress(tbAddr).publicKey;
                    const aa: string = uint8ArrayToHexString(decTbAddr, false);
                    const emitterAddr: string = await optin(
                        client,
                        wallet,
                        CORE_ID,
                        0,
                        aa,
                        "Algorand attestation test::emitterAddr"
                    );
                    console.log(
                        "getSignedVAAWithRetry starting with emitterAddr:",
                        tbAddr,
                        ", decTbAddr",
                        decTbAddr,
                        ", aa",
                        aa,
                        ", sn:",
                        sn.toString()
                    );
                    const { vaaBytes } = await getSignedVAAWithRetry(
                        WORMHOLE_RPC_HOSTS,
                        CHAIN_ID_ALGORAND,
                        aa,
                        sn.toString(),
                        { transport: NodeHttpTransport() }
                    );
                    const provider = new ethers.providers.WebSocketProvider(
                        ETH_NODE_URL
                    ) as any;
                    const signer = new ethers.Wallet(ETH_PRIVATE_KEY, provider);
                    let success: boolean = true;
                    try {
                        const cr = await createWrappedOnEth(
                            ETH_TOKEN_BRIDGE_ADDRESS,
                            signer,
                            vaaBytes
                        );
                    } catch (e) {
                        console.log(
                            "createWrappedOnEth() failed.  Trying updateWrappedOnEth()..."
                        );
                        success = false;
                    }
                    if (!success) {
                        const cr = await updateWrappedOnEth(
                            ETH_TOKEN_BRIDGE_ADDRESS,
                            signer,
                            vaaBytes
                        );
                        success = true;
                    }
                    console.log("Attestation is complete...");
                    console.log("Starting transfer to Eth...");
                    // Start transfer from Algorand to Ethereum
                    const ETH_TEST_WALLET_PUBLIC_KEY =
                        "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1";
                    const hexStr = nativeToHexString(
                        ETH_TEST_WALLET_PUBLIC_KEY,
                        CHAIN_ID_ETH
                    );
                    if (!hexStr) {
                        throw new Error("Failed to convert to hexStr");
                    }
                    let ethAcct: Account = {
                        addr: hexStr,
                        sk: hexStringToUint8Array("empty"),
                    };
                    ethAcct.addr = hexStr;
                    const AmountToTransfer: number = 1;
                    const Fee: number = 1;
                    console.log("Calling transferAsset...");
                    const txSid: bigint = await transferAsset(
                        client,
                        wallet,
                        assetIndex,
                        AmountToTransfer,
                        ethAcct,
                        CHAIN_ID_ETH,
                        Fee
                    );
                    console.log("Getting signed VAA...");
                    const signedVaa = await getSignedVAAWithRetry(
                        WORMHOLE_RPC_HOSTS,
                        CHAIN_ID_ALGORAND,
                        aa,
                        sn.toString(),
                        { transport: NodeHttpTransport() }
                    );
                    const roe = await redeemOnEth(
                        ETH_TOKEN_BRIDGE_ADDRESS,
                        signer,
                        signedVaa.vaaBytes
                    );
                    expect(
                        await getIsTransferCompletedEth(
                            ETH_TOKEN_BRIDGE_ADDRESS,
                            provider,
                            signedVaa.vaaBytes
                        )
                    ).toBe(true);

                    // Test finished.  Check wallet balances
                } catch (e) {
                    console.error("Algorand attestation error:", e);
                    done();
                    expect(false).toBe(true);
                }
                done();
            })();
        });
    });
});
