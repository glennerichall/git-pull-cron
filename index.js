#!/usr/bin/env node

const request = require('superagent-promise')(require('superagent'), Promise);
const sGit = require('simple-git/promise');
const bluebird = require('bluebird');
const mkdirp = bluebird.promisify(require('mkdirp'));
const fs = require('fs');
const exists = bluebird.promisify(fs.access);
const parseArgs = require('minimist');
const stream = require('logrotate-stream');
const path = require('path');

const argv = parseArgs(process.argv);
const token = process.env['GIT-BACKUP-TOKEN'] || argv.token || argv.t;
const server = process.env['GIT-BACKUP-SERVER'] || argv.server || argv.s;
const folder = process.env['GIT-BACKUP-DESTINATION'] || argv.folder || argv.f || 'git-backup';
const logfile = process.env['GIT-BACKUP-LOGFILE'] || path.join(folder, 'git-backup.log');

const toLogFile = stream({file: logfile, size: '100k', keep: 5});

const print = console.log.bind(console);
console.error = ()=>{};
console.log = s => {
    const msg = `[${new Date().toISOString()}] ${s}`;
    print(msg);
    toLogFile.write(msg + "\n");
};

(async function () {
    const promises = [];
    let success = true;
    try {
        const workingDir = path.join(folder, server.replace(':', '_'));

        await mkdirp(workingDir);

        const getProjects = (archived) => request
            .get(`https://${server}/api/v4/projects`)
            .set('PRIVATE-TOKEN', token)
            .set('Accept', 'application/json')
            .query({archived})
            .end();

        let projects0 = await getProjects(false);
        let projects1 = await getProjects(true);
        const projects = projects0.body.concat(projects1.body);
        const git = sGit();

        console.log(`${projects.length} projects found`);

        console.log(`backuping git remote to ${workingDir}`);
        for (let i = 0; i < projects.length && !argv.dryrun; i++) {
            const project = projects[i];
            const url = project.ssh_url_to_repo;
            const dir = project.name_with_namespace.replace(/ /g, '').replace(/\//g, path.sep);
            const dst = path.join(workingDir, dir);
            const promise = mkdirp(dst)
                .then(async () => {
                    var action;
                    try {
                        // before each await on git, set back current working directory (cwd)
                        // since async operations will have chante it for each promise
                        git.cwd(dst);
                        let isRepo = await git.checkIsRepo();
                        if (isRepo) {
                            action = 'updating';
                            git.cwd(dst);
                            await git.raw(['remote', 'update']);
                        } else {
                            action = 'cloning';
                            git.cwd(workingDir);
                            await git.mirror(url, dir);
                        }
                        console.log(`[success] ${action} ${url} to ${dir}`)
                    } catch (err) {
                        console.log(`[failure] ${action} ${url} to ${dir} \n ${err.message}`);
                    }
                });
            promises.push(promise);
        }
    } catch (err) {
        console.log(`[failure] ${err.message}`);
        success = false;
    } finally {
        await bluebird.all(promises);
        if (success) {
            console.log("[success] done");
            toLogFile.end();
        }
        else {
            console.log("[failure] done");
            toLogFile.end();
            process.exit(1);
        }
    }
})();
