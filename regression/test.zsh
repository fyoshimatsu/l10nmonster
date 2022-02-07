set -e

regressTest() {
    echo "\nTesting $1..."
    cd $1
    ../../../l10n.js --regression grandfather -q 70
    ../../../l10n.js --regression leverage -q 69 -u 61
    ../../../l10n.js --regression push
    ../../../l10n.js --regression pull
    ../../../l10n.js --regression translate
    ../../../l10n.js --regression status -b foo -r bar
    cd ..
}

rm -rf wd
# rm **/.DS_Store
mkdir wd
cp -pr mint/* wd
cd wd
for dir in *; regressTest $dir
cd ..

echo "\nDiffing working dir vs. expected..."
rm -rf wd/*/.l10nmonster
diff -qr wd expected