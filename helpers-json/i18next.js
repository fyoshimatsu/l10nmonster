// i18next v4 json format defined at https://www.i18next.com/misc/json-format
const flat = require('flat');
const { regex } = require('@l10nmonster/helpers');
const { flattenAndSplitResources, ARB_ANNOTATION_MARKER, FLATTEN_SEPARATOR } = require('./utils');

const isArbAnnotations = e => e[0].split('.').slice(-2)[0].startsWith(ARB_ANNOTATION_MARKER);
const validArbAnnotations = new Set(['description', 'type', 'context', 'placeholders', 'screenshot', 'video', 'source_text']);
const validPluralSuffixes = new Set(['one', 'other', 'zero', 'two', 'few', 'many']);
const extractArbGroupsRegex = /(?<prefix>.+?\.)?@(?<key>\S+)\.(?<attribute>\S+)/;

function parseResourceAnnotations(resource, enableArbAnnotations) {
    if (!enableArbAnnotations) {
        return [ Object.entries(flat.flatten(resource)), {} ]
    }

    const { res, notes } = flattenAndSplitResources([], resource)
    const parsedNotes = {}
    for (const [key, arbAnnotations] of Object.entries(notes)) {
        if (typeof arbAnnotations === "object") {
            const notes = []
            for (const [annotation, data] of Object.entries(arbAnnotations)) {
                // Intentionally uses `== null` to handle undefined and null
                // eslint-disable-next-line no-eq-null, eqeqeq
                if (validArbAnnotations.has(annotation) && data != null) {
                    if (annotation === "description") {
                        notes.push(data)
                    } else if (annotation === "placeholders") {
                        notes.push(`placeholders: ${JSON.stringify(data)}`)
                    } else {
                        notes.push(`${annotation}: ${data}`)
                    }
                }
            }
            parsedNotes[key] = notes.join("\n")
        } else {
            parsedNotes[key] = arbAnnotations
            // If ARB annotation is not an object, treat it as if it is a resource too
            // so that a linter implementation may catch it and warn developers about it
            const keys = key.split(FLATTEN_SEPARATOR)
            const fix = keys.pop()
            const fixedKey = keys.concat(`${ARB_ANNOTATION_MARKER}${fix}`).join(FLATTEN_SEPARATOR)
            res[fixedKey] = arbAnnotations
        }
    }
    return [ Object.entries(res), parsedNotes ];
}

exports.Filter = class I18nextFilter {
    constructor(params) {
        this.enableArbAnnotations = params?.enableArbAnnotations || false;
        this.enablePluralSuffixes = params?.enablePluralSuffixes || false;
        this.enableArrays = params?.enableArrays || false;
        this.emitArbAnnotations = params?.emitArbAnnotations || false;
    }

    async parseResource({ resource }) {
        const segments = [];
        if (!resource) {
            return { segments };
        }
        const [ parsedResource, notes ] = parseResourceAnnotations(JSON.parse(resource), this.enableArbAnnotations);
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
        let flatResource = flat.flatten(JSON.parse(resource));
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
        return JSON.stringify(flat.unflatten(flatResource, { object: !this.enableArrays }), null, 2) + '\n';
    }
}

// i18next v4 placeholder formats
// - "keyNesting": "reuse $t(keyDeep.inner)", or
// - "keyInterpolate": "replace this {{value}}"
// See: https://www.i18next.com/misc/json-format#i18next-json-v4
exports.phDecoder = regex.decoderMaker(
    'i18nextKey',
    /(?<nestingPh>\$t\([\w:.]+\))|(?<doubleBracePh>{{[^}]+}})/g,
    (groups) => ({ t: 'x', v: groups.nestingPh ?? groups.doubleBracePh })
);
