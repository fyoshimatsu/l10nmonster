// i18next j4 json format defined at https://www.i18next.com/misc/json-format
import { default as flat } from 'flat';

const isArbAnnotations = e => e[0].split('.').slice(-2)[0].startsWith('@');
const validArbAnnotations = new Set(['description', 'type', 'context', 'placeholders', 'screenshot', 'video', 'source_text']);
const validPluralSuffixes = new Set(['one', 'other', 'zero', 'two', 'few', 'many']);
const extractArbGroupsRegex = /(?<prefix>.+?\.)?@(?<key>\S+)\.(?<attribute>\S+)/;

function parseResourceAnnotations(resource, enableArbAnnotations, verbose) {
    let parsedResource = Object.entries(flat.flatten(resource));
    const notes = {};
    if (enableArbAnnotations) {
        for (const [key, value] of parsedResource.filter(isArbAnnotations)) {
            const arbGroups = extractArbGroupsRegex.exec(key).groups;
            const sid = `${arbGroups.prefix ?? ''}${arbGroups.key}`;
            if (validArbAnnotations.has(arbGroups.attribute)) {
                notes[sid] = `${notes[sid] ? `${notes[sid]}\n` : ''}${arbGroups.attribute === 'description' ? '' : `${arbGroups.attribute}: `}${arbGroups.attribute === 'placeholders' ? JSON.stringify(value) : value}`;
            } else if (verbose) {
                console.error(`Unexpected ${arbGroups.attribute} annotation for SID ${sid}`);
            }
        }    
    }
    enableArbAnnotations && (parsedResource = parsedResource.filter(e => !isArbAnnotations(e)));
    return [ parsedResource, notes ];
}

export class JsonFilter {
    constructor(params) {
        this.enableArbAnnotations = params?.enableArbAnnotations || false;
        this.enablePluralSuffixes = params?.enablePluralSuffixes || false;
        this.emitArbAnnotations = params?.emitArbAnnotations || false;
    }

    async parseResource({ resource }) {
        const segments = [];
        const [ parsedResource, notes ] = parseResourceAnnotations(resource, this.enableArbAnnotations, this?.ctx?.verbose);
        for (const [key, value] of parsedResource) {
            let seg = { sid: key, str: value };
            notes[key] && (seg.notes = notes[key]);
            if (this.enablePluralSuffixes && key.indexOf('_') !== -1 && validPluralSuffixes.has(key.split('_').slice(-1)[0])) {
                seg.isSuffixPluralized = true;
            }
            segments.push(seg);
        }    
        return {
            segments,
        };
    }

    async translateResource({ resource, translator }) {
        let flatResource = flat.flatten(resource);
        for (const entry of Object.entries(flatResource)) {
            if (!this.enableArbAnnotations || !isArbAnnotations(entry)) {
                const translation = await translator(...entry);
                if (translation === undefined) {
                    delete flatResource[entry[0]];
                } else {
                    flatResource[entry[0]] = translation;
                    // TODO: deal with pluralized forms as well
                }    
            }
        }
        if (this.enableArbAnnotations) {
            for (const entry of Object.entries(flatResource).filter(entry => isArbAnnotations(entry))) {
                const arbGroups = extractArbGroupsRegex.exec(entry[0]).groups;
                const sid = `${arbGroups.prefix ?? ''}${arbGroups.key}`;
                if (!this.emitArbAnnotations || !flatResource[sid]) {
                    delete flatResource[entry[0]];
                }
            }
        }
        return flat.unflatten(flatResource);
    }
}