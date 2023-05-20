import {
    getNormalizedString, sourceAndTargetAreCompatible, normalizedStringsAreEqual,
    flattenNormalizedSourceV1, extractNormalizedPartsV1,
} from '../normalizers/util.js';
import { makeTU } from '../shared.js';

// existing translations in resources but not in TM are assumed to be in sync
// with source and are imported into the TM at the configured quality level
export class Grandfather {
    constructor({ quality }) {
        if (quality === undefined) {
            throw 'You must specify a quality property for Grandfather';
        }
        this.quality = quality;
    }

    async requestTranslations(jobRequest) {
        const { tus, ...jobResponse } = jobRequest;
        jobResponse.tus = [];
        const txCache = {};
        const resourceStats = Object.fromEntries((await this.ctx.mm.source.getResourceStats()).map(r => [r.id, r]));
        for (const tu of tus) {
            if (!txCache[tu.rid]) {
                const resMeta = resourceStats[tu.rid];
                const pipeline = this.ctx.mm.contentTypes[resMeta.contentType];
                const lookup = {};
                try {
                    const resource = await pipeline.target.fetchTranslatedResource(jobRequest.targetLang, tu.rid);
                    const parsedResource = await pipeline.resourceFilter.parseResource({ resource, isSource: false });
                    for (const seg of parsedResource.segments) {
                        if (pipeline.decoders) {
                            const normalizedStr = getNormalizedString(seg.str, pipeline.decoders);
                            if (normalizedStr[0] !== seg.str) {
                                seg.nstr = normalizedStr;
                            }
                        }
                        lookup[seg.sid] = makeTU(resMeta, seg);
                    }
            } catch (e) {
                    this.ctx.logger.info(`Couldn't fetch translated resource: ${e}`);
                }
                txCache[tu.rid] = lookup;
            }
            const previousTranslation = txCache[tu.rid][tu.sid];
            if (previousTranslation !== undefined) {
                const translation = {
                    guid: tu.guid,
                    q: this.quality,
                };
                !tu.nsrc && (translation.src = tu.src);
                tu.nsrc && (translation.nsrc = tu.nsrc);
                if (previousTranslation.nsrc) {
                    const [ flattenSrc, phMap ] = flattenNormalizedSourceV1(previousTranslation.nsrc);
                    translation.ntgt = extractNormalizedPartsV1(flattenSrc, phMap);
                } else {
                    translation.tgt = previousTranslation.src;
                }
                previousTranslation.ts && (translation.ts = previousTranslation.ts);
                const isCompatible = sourceAndTargetAreCompatible(tu?.nsrc ?? tu?.src, translation?.ntgt ?? translation?.tgt);
                if (isCompatible) {
                    jobResponse.tus.push(translation);
                }
            }
        }
        jobResponse.status = 'done';
        this.ctx.logger.info(`Grandfathering ${jobRequest.targetLang}... found ${tus.length} missing translations, of which ${jobResponse.tus.length} can be grandfathered`);
        return jobResponse;
    }

    // sync api only
    async fetchTranslations() {
        throw 'Grandfather is a synchronous-only provider';
    }

    async refreshTranslations(jobRequest) {
        const fullResponse = await this.requestTranslations(jobRequest);
        const reqTuMap = jobRequest.tus.reduce((p,c) => (p[c.guid] = c, p), {});
        return {
            ...fullResponse,
            tus: fullResponse.tus.filter(tu => !normalizedStringsAreEqual(reqTuMap[tu.guid].ntgt ?? reqTuMap[tu.guid].tgt, tu.ntgt ?? tu.tgt)),
        };
    }
}
