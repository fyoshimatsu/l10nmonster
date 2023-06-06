export async function jobsCmd(mm, { limitToLang }) {
    const unfinishedJobs = {};
    const targetLangs = await mm.getTargetLangs(limitToLang);
    for (const targetLang of targetLangs) {
        const pendingJobs = (await mm.jobStore.getJobStatusByLangPair(mm.sourceLang, targetLang))
            .filter(e => e[1].status !== 'done');
        unfinishedJobs[targetLang] = [];
        for (const [ jobGuid, handle ] of pendingJobs) {
            unfinishedJobs[targetLang].push(await (handle.status === 'pending' ? mm.jobStore.getJob(jobGuid) : mm.jobStore.getJobRequest(jobGuid)));
        }
    }
    return unfinishedJobs;
}
