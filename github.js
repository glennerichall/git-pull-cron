const request = require('superagent');

module.exports = async ({server, token, login}) => {

    const url = `${server}/search/repositories`;

    const getProjects = () => new Promise(
        (resolve, reject) =>
            request(url)
                .set('Authorization', `token ${token}`)
                .set('Accept', 'application/vnd.github.v3+json')
                .set('User-Agent', login)
                .query({q: `user:${login}`})
                .end((err, res) => {
                    if (err) reject(err);
                    else resolve(res);
                }));

    let res = await getProjects();
    if(res.status !== 200) {
        throw new Error(`request error ${res.status} at ${url}`)
    }
    res = res.body;

    return res.items.map(project => {
        return {
            name: project.full_name,
            url: project.ssh_url
        };
    })
};