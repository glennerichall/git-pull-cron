const util = require('util');
const exec = util.promisify(require('child_process').exec);

module.exports = async (args) => {
    console.log("[info] installing Scheduled Task for Windows");
    const name = 'velor\\Backup git repo';

    const createTask = async () => {
        try {

            await exec(`schtasks /create /tn "${name}" /sc daily /tr "%userprofile%\\AppData\\Roaming\\npm\\git-pull-cron.cmd" ${args}`);
        } catch (err) {
            console.log(`[failure] ${err.message}`);
        }
    };

    try {
        await exec(`schtasks /query /tn "${name}"`);
        console.log(`[info] task "${name}" already exists`);
        console.log(`[info] deleting "${name}"`);
        await exec(`schtasks /delete /tn "${name}"`);
    } catch (err) {
    } finally {
        console.log(`[info] creating "${name}"`);
        await createTask();
    }
}