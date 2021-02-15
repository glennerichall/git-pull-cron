const request = require('superagent');

module.exports = async ({server, token}) => {

    const getProjects = (archived) => new Promise(
        (resolve, reject) =>
            request(`${server}/api/v4/projects`)
                .set('PRIVATE-TOKEN', token)
                .set('Accept', 'application/json')
                .query({archived})
                .end((err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                })
    );

    let projects0 = (await getProjects(false)).body;
    let projects1 = (await getProjects(true)).body;
    const projects = projects0;

    for (let i = 0; i < projects1.length; i++) {
        if (!projects.some(p => p.id == projects1[i].id)) {
            projects.push(projects1[i]);
        }
    }

    return projects.map(project => {
        return {
            url: project.ssh_url_to_repo,
            name: project.name_with_namespace
        };
    });
}
;