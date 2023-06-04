/* eslint-disable no-invalid-this */
import vscode from 'vscode';
import { statusCmd } from '@l10nmonster/core';
import { withMonsterManager, getMonsterPage, escapeHtml, renderString } from './monsterUtils.js';

function computeTotals(totals, partial) {
    for (const [ k, v ] of Object.entries(partial)) {
        if (typeof v === 'object') {
            totals[k] ??= {};
            computeTotals(totals[k], v);
        } else {
            totals[k] ??= 0;
            totals[k] += v;
        }
    }
}

export async function fetchStatusPanel(mm) {
    const stats = await mm.source.getResourceStats();
    const sourcesStatus = {
        key: 'sources',
        label: `Sources (${stats.length.toLocaleString()})`,
        children: stats.map(s => ({
            key: s.id,
            label: s.id,
            tooltip: `modified: ${s.modified}\n languages: ${s.targetLangs.join(', ')}`,
        })),
    };
    const targetLangs = await mm.getTargetLangs(false, true);
    const translationStatus = {
        key: 'translationStatus',
        label: 'Translation Status',
        children: targetLangs.map(lang => ({
            key: lang,
            label: `Language ${lang}`,
            lazyChildren: {
                command: 'l10nmonster.fetchStatusByLanguage',
                arguments: [ lang ]
            }
        })),
    };
    return [ sourcesStatus, translationStatus ];
}

const alertIcon = new vscode.ThemeIcon('alert');
const checkIcon = new vscode.ThemeIcon('check');

// note: this will run as a method of the provider class, so `this` will point to that instance
export async function fetchStatusByLanguage(lang) {
    return withMonsterManager(this.configPath, async mm => {
        const status = await statusCmd(mm, { limitToLang: lang });
        const langStatus = status.lang[lang];
        const totals = {};
        const prjDetail = [];
        const prjLeverage = Object.entries(langStatus.leverage.prjLeverage).sort((a, b) => (a[0] > b[0] ? 1 : -1));
        for (const [prj, leverage] of prjLeverage) {
            computeTotals(totals, leverage);
            if (leverage.untranslatedWords > 0) {
                prjDetail.push({
                    key: prj,
                    iconPath: alertIcon,
                    label: `${prj}: ${leverage.untranslatedWords.toLocaleString()} words ${leverage.untranslated.toLocaleString()} strings`,
                    command: {
                        command: 'l10nmonster.showUntranslated',
                        title: '',
                        arguments: [ lang, prj ]
                    }
                });
            } else {
                prjDetail.push({
                    key: prj,
                    iconPath: checkIcon,
                    label: `${prj}: fully translated`,
                });
            }
        }
        prjDetail.length > 1 && prjDetail.push({
            key: 'totals',
            label: `Total: ${totals.untranslatedWords.toLocaleString()} words ${totals.untranslated.toLocaleString()} strings`,
        });
        return prjDetail;
    });
}

// note: this will run as a method of the provider class, so `this` will point to that instance
export async function showUntranslated(lang, prj) {
    return withMonsterManager(this.configPath, async mm => {
        const jobBody = await mm.prepareTranslationJob({ targetLang: lang });
        const tabName = `${prj} (${lang})`;
        const panel = vscode.window.createWebviewPanel(
            'showUntranslatedView',
            tabName,
            vscode.ViewColumn.One,
            { enableFindWidget: true }
        );
        panel.webview.html = getMonsterPage(tabName, `
            <h2>Untranslated content for project ${prj}, language: ${lang}</h2>
            ${jobBody.tus.length > 0 ?
                `<table>
                    <tr><th>rid / sid</th><th>Source</th><th>Notes</th></tr>
                    ${jobBody.tus.map(tu => `<tr><td><i>${tu.rid}</i><br /><b>${tu.sid}</b></td><td>${renderString(tu.src, tu.nsrc)}</td><td>${escapeHtml(tu?.notes?.desc) ?? ''}</td>`).join('\n')}
                </table>` :
                '<h4>Nothing found!</h4>'
            }
        `);
    }, prj === 'default' ? undefined : prj);
}
