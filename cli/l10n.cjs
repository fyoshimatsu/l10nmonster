#!/usr/bin/env node
/* eslint-disable no-underscore-dangle */

const path = require('path');
const { existsSync } = require('fs');
const { Command, Argument, InvalidArgumentError } = require('commander');
const { runL10nMonster } = require('./out/l10nCommands.cjs');

/* eslint-disable no-invalid-this */
/* eslint-disable prefer-arrow-callback */

// eslint-disable-next-line no-unused-vars
function intOptionParser(value, _dummyPrevious) {
    const parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue)) {
      throw new InvalidArgumentError('Not an integer');
    }
    return parsedValue;
  }

function createMonsterCLI(actionHandler) {
    const monsterCLI = new Command();
    monsterCLI
        .name('l10n')
        .version('0.1.0', '--version', 'output the current version number')
        .description('Continuous localization for the rest of us.')
        .option('-v, --verbose [level]', '0=error, 1=warning, 2=info, 3=verbose', intOptionParser)
        .option('-p, --prj <prj1,...>', 'limit source to specified projects')
        .option('--arg <string>', 'optional config constructor argument')
        .option('--regression', 'keep variables constant during regression testing');
    monsterCLI.command('status')
        .description('translation status of content.')
        .option('-l, --lang <language>', 'only get status of target language')
        .option('-a, --all', 'show information for all projects, not just untranslated ones')
        .option('--output <filename>', 'write status to the specified file')
        .action(actionHandler);
    monsterCLI.command('jobs')
        .description('unfinished jobs status.')
        .option('-l, --lang <language>', 'only get jobs for the target language')
        .action(actionHandler);
    monsterCLI.command('analyze')
        .description('content reports and validation.')
        .argument('[analyzer]', 'name of the analyzer to run')
        .argument('[params...]', 'optional parameters to the analyzer')
        .option('-l, --lang <language>', 'target language to analyze (if TM analyzer)')
        .option('--filter <filter>', 'use the specified tu filter')
        .option('--output <filename>', 'filename to write the analysis to)')
        .action(actionHandler);
    monsterCLI.command('push')
        .description('push source content upstream (send to translation).')
        .option('-l, --lang <language>', 'target language to push')
        .option('--filter <filter>', 'use the specified tu filter')
        .option('--driver <untranslated|source|tm|job:jobGuid>', 'driver of translations need to be pushed (default: untranslated)')
        .option('--leverage', 'eliminate internal repetitions from untranslated driver')
        .option('--refresh', 'refresh existing translations without requesting new ones')
        .option('--provider <name,...>', 'use the specified translation providers')
        .option('--instructions <instructions>', 'send the specified translation instructions')
        .option('--dryrun', 'simulate translating and compare with existing translations')
        .action(actionHandler);
    monsterCLI.command('job')
        .description('show request/response/pairs of a job or push/delete jobs.')
        .addArgument(new Argument('<operation>', 'operation to perform on job').choices(['req', 'res', 'pairs', 'push', 'delete']))
        .requiredOption('-g, --jobGuid <guid>', 'guid of job')
        .action(actionHandler);
    monsterCLI.command('pull')
        .description('receive outstanding translation jobs.')
        .option('--partial', 'commit partial deliveries')
        .option('-l, --lang <language>', 'only get jobs for the target language')
        .action(actionHandler);
    monsterCLI.command('snap')
        .description('commits a snapshot of sources in normalized format.')
        .option('--maxSegments <number>', 'threshold to break up snapshots into chunks')
        .action(actionHandler);
    monsterCLI.command('translate')
        .description('generate translated resources based on latest source and translations.')
        .option('-l, --lang <language>', 'target language to translate')
        .option('-d, --dryrun', 'simulate translating and compare with existing translations')
        .action(actionHandler);
    monsterCLI.command('tmexport')
        .description('export translation memory in various formats.')
        .addArgument(new Argument('<mode>', 'export source (including untranslated) or tm entries (including missing in source)').choices(['source', 'tm']))
        .addArgument(new Argument('<format>', 'exported file format').choices(['tmx', 'json', 'job']))
        .option('-l, --lang <language>', 'target language to export')
        .option('--prjsplit', 'split target files by project')
        .action(actionHandler);
    monsterCLI.command('monster')
        .description('just because...')
        .action(actionHandler);
    return monsterCLI;
}

async function runMonsterCLI(monsterConfigPath) {
    try {
        let crutch = {};
        const actionHandler = async function actionHandler() {
            const options = this.opts();
            // Need to hack into the guts of commander as it doesn't seem to expose argument names
            const args = Object.fromEntries(this._args.map((arg, idx) => [
                arg._name,
                arg.variadic ? this.args.slice(idx) : this.args[idx]
            ]));
            await runL10nMonster(monsterConfigPath, crutch.globalOptions, async l10n => {
                await l10n[this.name()]({ ...options, ...args });
            });
        };
        const monsterCLI = createMonsterCLI(actionHandler);
        crutch.globalOptions = monsterCLI.opts();
        const Config = require(monsterConfigPath);
        if (Config.extensionCmds) {
            Config.extensionCmds.forEach(extCmd => {
                const help = extCmd.help;
                let cmd = monsterCLI.command(extCmd.name)
                    .description(help.description)
                    .action(actionHandler);
                    help.options && help.options.forEach(opt => cmd.option(...opt));
                    help.requiredOptions && help.requiredOptions.forEach(opt => cmd.requiredOption(...opt));
                    help.arguments && help.arguments.forEach(opt => cmd.argument(...opt));
                })
        }
        await monsterCLI.parseAsync();
    } catch(e) {
        console.error(`Unable to run: ${e.stack || e}`);
        process.exit(1);
    }
}

function findConfig() {
    let baseDir = path.resolve('.'),
        previousDir = null;
    while (baseDir !== previousDir) {
        const configPath = path.join(baseDir, 'l10nmonster.cjs');
        if (existsSync(configPath)) {
            return configPath;
        }
        previousDir = baseDir;
        baseDir = path.resolve(baseDir, '..');
    }
    return [];
}

(async () => {
    await runMonsterCLI(findConfig());
})();
