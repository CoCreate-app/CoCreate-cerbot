// const util = require('node:util');
// const exec = require('node:child_process').exec;
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const dns = require('dns');
const child_process = require('child_process');
const spawn = child_process.spawn;

const localip = '3.231.17.247'
const certificates = new Map()
const certbotPath = `/etc/letsencrypt/live/`;

// Haproxy ssl managent
const fullchainPath = `${certbotPath}/fullchain.pem`;
const privkeyPath = `${certbotPath}/privkey.pem`;
const combinedPath = `${certbotPath}/haproxy.pem`;

async function checkDns(host) {
    return new Promise((resolve, reject) => {

        try {
            dns.resolve(host, 'A', (err, records) => {
                if (records && records[0] === localip) {
                    resolve(true)
                } else {
                    console.log('host A record need to point to', localip)
                    resolve(false)
                }
                if (err)
                    console.log(host, err);
            });
        } catch (err) {
            console.log('certificate', err)
        }
    });
}

async function createCert(host) {
    try {
        // let hosts = await execAsync(`host ${host}`);
        // console.log('hostst check', hosts)

        let dns = await checkDns(host);
        console.log('checked dns from createCert', dns);
        if (dns) {
            // Execute certbot command and wait for it to finish
            const { stdout, stderr } = await execAsync(`sudo certbot -d ${host} -d www.${host}`);

            // Log the output for debugging purposes
            console.log('Certbot stdout:', stdout);
            console.error('Certbot stderr:', stderr);

            // Analyze the output or stderr to confirm success
            // Usually, Certbot will indicate success or failure in its output
            if (stdout.includes('Congratulations! Your certificate and chain have been saved at') || !stderr) {
                return true; // Success
            } else {
                console.error('Certbot failed:', stderr);
                return false; // Failure or something unexpected occurred
            }
        } else {
            return false; // DNS check failed
        }
    } catch (err) {
        console.error('Error in createCert:', err);
        return false; // Exception occurred
    }
}

async function deleteCert(host) {
    try {
        await execAsync(`sudo certbot delete --cert-name ${host}`);
        return true
    } catch (err) {
        return false
    }
}

async function checkCert(host) {
    try {
        if (certificates.has(host))
            return true
        else {
            let certs = await execAsync(`sudo openssl x509 -dates -noout -in /etc/letsencrypt/live/${host}/fullchain.pem`);
            let cert = certs.stdout.split('\n')
            let issued = Date.parse(cert[0].replace('notBefore=', ''))
            let expires = Date.parse(cert[1].replace('notAfter=', ''))
            let currentDate = new Date()

            if (!issued || !expires)
                console.log('not defined', { issued, expires })
            else if (!isNaN(expires)) {
                if (currentDate < expires) {
                    certificates.set(host, { issued, expires })
                    return true
                } else {
                    return await createCert(host)
                }
            } else {
                return await createCert(host)
            }
        }
    } catch (err) {
        if (await createCert(host)) {
            certificates.set(host, { issued, expires })
            return true
        }
    }
}

const combineCertificate = (host) => {
    const certbotPath = `/etc/letsencrypt/live/${host}`;
    const fullchainPath = `${certbotPath}/fullchain.pem`;
    const privkeyPath = `${certbotPath}/privkey.pem`;
    const combinedPath = `${certbotPath}/haproxy.pem`;

    fs.readFile(fullchainPath, (err, fullchainData) => {
        if (err) {
            console.error('Error reading fullchain.pem:', err);
            return;
        }

        fs.readFile(privkeyPath, (err, privkeyData) => {
            if (err) {
                console.error('Error reading privkey.pem:', err);
                return;
            }

            const combinedData = `${fullchainData}\n${privkeyData}`;
            fs.writeFile(combinedPath, combinedData, (err) => {
                if (err) {
                    console.error('Error writing combined haproxy.pem:', err);
                } else {
                    console.log('Successfully combined certificates for HAProxy.');
                }
            });
        });
    });
};

async function test(host) {
    try {


        await execAsync(`sudo certbot certonly --manual --test-cert -d *.${host} -d  ${host} --agree-tos --preferred-challenges dns-01 --server https://acme-v02.api.letsencrypt.org/directory`);
        let exitCode = await spawn('sudo', ['certbot', 'certonly', '--manual', '--test-cert', '-d', `*.${host}`, '-d', host, '--agree-tos', '--preferred-challenges', 'dns-01', '--server', 'https://acme-v02.api.letsencrypt.org/directory'], { stdio: 'inherit', cwd: process.cwd() })
        if (exitCode !== 0) {
            failed.push({ name: false, des: `creating directory failed` })
        } else
            console.log(true)

        // let child = execAsync('su -')
        // child.stdin.write("testserver\n");

        // child.stdout.on('data', (data) => {
        //     console.log(`stdout: "${data}"`);
        // });

        // child.stdin.end(); // EOF

        // child.on('close', (code) => {
        //     console.log(`Child process exited with code ${code}.`);
        // });

        // exitCode.on("data", data => {
        //     console.log('test')
        // })
        // let test = exitCode
        // if (exitCode !== 0) {
        //     exitCode.write('test', (err) => {
        //         if (err) throw Error(err.message)
        //     })
        // } else {
        //     exitCode.write('test', (err) => {
        //         if (err) throw Error(err.message)
        //     })
        // }

        // return true
        // return false
    } catch (err) {
        process.exit(1)
        //    return false
    }
}


// test('cocreate.app')

module.exports = { checkDns, checkCert, createCert, deleteCert }