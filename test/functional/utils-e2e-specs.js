// transpile:mocha
import { getSimulator, killAllSimulators } from '../..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { LONG_TIMEOUT } from './helpers';
import B from 'bluebird';
import wd from 'wd';
import https from 'https';
import { startServer }  from 'appium-xcuitest-driver';
import { installSSLCert } from '../../lib/utils';

chai.should();
chai.use(chaiAsPromised);

async function verifyStates (sim, shouldServerRun, shouldClientRun) {
  const isServerRunning = await sim.isRunning();
  isServerRunning.should.eql(shouldServerRun);
  const isClientRunning = await sim.isUIClientRunning();
  isClientRunning.should.eql(shouldClientRun);
}

const deviceVersion = process.env.DEVICE ? process.env.DEVICE : '10.3';

describe.skip('killAllSimulators', function () {
  this.timeout(LONG_TIMEOUT);

  let sim;
  beforeEach(async function () {
    let udid = await simctl.createDevice('ios-simulator testing',
                                         'iPhone 6s',
                                         deviceVersion,
                                     20000);
    sim = await getSimulator(udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});
  });
  afterEach(async function () {
    await simctl.deleteDevice(sim.udid);
  });
  it('should be able to kill the simulators', async function () {
    await verifyStates(sim, true, true);
    await killAllSimulators();
    await verifyStates(sim, false, false);
  });
});

describe('.installSSLCertificate', function () {
  const pem = B.promisifyAll(require('pem'));
  const HOST = 'localhost';
  const XCUI_PORT = 4998;
  const HTTPS_PORT = 4999;

  let keys, xcuiTestServer;

  before(async function () {
    // Create an HTTPS server with a randomly generated certificate
    let {key} = await pem.createPrivateKeyAsync();
    keys = await pem.createCertificateAsync({days:1, selfSigned: true, serviceKey: key});
    https.createServer({key: keys.serviceKey, cert: keys.certificate}, function (req, res) {
      res.end('If you are seeing this the certificate has been installed');
    }).listen(HTTPS_PORT);

    // Start XCUITest server so we can do Safari tests
    xcuiTestServer = await startServer(XCUI_PORT, HOST);
  });

  after(async function () {
    if (xcuiTestServer) {
      xcuiTestServer.close();
    }
  });

  it('should open the private server when SSL cert is installed, should not open it when it is not installed', async function () {
    let driver = wd.promiseChainRemote(HOST, XCUI_PORT);
    await driver.init({
      "browserName": "Safari",
      "platformName": "iOS",
      "platformVersion": deviceVersion,
      "deviceName": "iPhone 6",
      "automationName": "XCUITest",
      "noReset": true,
      "maxTypingFrequency": 30,
      "clearSystemFiles": true,
      "showXcodeLog": true,
    });
    const {udid} = await driver.sessionCapabilities();
    await installSSLCert(keys.certificate, udid);
    await driver.get(`https://${HOST}:${HTTPS_PORT}`);
    await driver.source().should.eventually.contain('certificate has been installed');
  });
});
