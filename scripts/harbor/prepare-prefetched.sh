#!/bin/bash
# Criteria1.3: dependency caches only; official task and verifier remain untouched.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
cd /opt/wo74
sha256sum -c SHA256SUMS
mkdir -p repo/dists wheels
# The original Ubuntu keyring, not a key supplied by the cache, authenticates releases.
for release in lists/*_InRelease; do
    suite=${release##*_dists_}; suite=${suite%_InRelease}
    mkdir -p "repo/dists/$suite"
    gpgv --keyring /usr/share/keyrings/ubuntu-archive-keyring.gpg "$release"
    cp "$release" "repo/dists/$suite/InRelease"
done
for index in lists/*_Packages.lz4; do
    relative=${index##*_dists_}; suite=${relative%%_*}; relative=${relative#*_}
    component=${relative%%_*}; relative=${relative#*_}; architecture=${relative%%_*}
    dest="repo/dists/$suite/$component/$architecture/Packages"
    mkdir -p "$(dirname "$dest")"
    /usr/lib/apt/apt-helper cat-file "$index" > "$dest"
    expected=$(awk -v p="$component/$architecture/Packages" '/^SHA256:/{s=1;next} s && /^[^ ]/{s=0} s && $3==p {print $1}' "repo/dists/$suite/InRelease")
    test -n "$expected"
    printf '%s  %s\n' "$expected" "$dest" | sha256sum -c -
done
# apt may omit zero-length indexes from its cache. Recreate only signed empty
# indexes, then verify their exact SHA256 before exposing them to apt.
for release in repo/dists/*/InRelease; do
    directory=${release%/InRelease}
    while read -r expected size relative; do
        mkdir -p "$directory/$(dirname "$relative")"
        : > "$directory/$relative"
        printf '%s  %s\n' "$expected" "$directory/$relative" | sha256sum -c -
    done < <(awk '/^SHA256:/{s=1;next} s && /^[^ ]/{s=0} s && $2==0 && $3~/binary-arm64\/Packages$/ {print $1,$2,$3}' "$release")
done
# Recover each package's original repository path and SHA256 from authenticated indexes.
awk 'BEGIN{RS="";FS="\n"} {f="";h=""; for(i=1;i<=NF;i++){if($i~/^Filename: /)f=substr($i,11);if($i~/^SHA256: /)h=substr($i,9)} if(f!=""&&h!="")print f,h}' repo/dists/*/*/binary-arm64/Packages > package-hashes.txt
for package in archives/*.deb; do
    base=${package##*/}
    match=$(awk -v b="/$base" 'substr($1,length($1)-length(b)+1)==b {print $1,$2}' package-hashes.txt | sort -u)
    test "$(printf '%s\n' "$match" | wc -l)" -eq 1
    read -r relative expected <<< "$match"
    printf '%s  %s\n' "$expected" "$package" | sha256sum -c -
    mkdir -p "repo/$(dirname "$relative")"; cp "$package" "repo/$relative"
done
# A local snapshot of the signed Ubuntu repository, with expiry and signatures enabled.
cat > /etc/apt/sources.list.d/ubuntu.sources <<'APT'
Types: deb
URIs: file:/opt/wo74/repo
Suites: noble noble-updates noble-backports noble-security
Components: main restricted universe multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
APT
printf '#clear Acquire::CompressionTypes::Order;\nAcquire::CompressionTypes::uncompressed ".";\nAcquire::CompressionTypes::Order { "uncompressed"; };\nAcquire::By-Hash "false";\nAcquire::Languages "none";\nAcquire::Retries "0";\n' > /etc/apt/apt.conf.d/zz-wo74-local-cache
apt-config dump > /opt/wo74/apt-effective-config.txt
apt-get --print-uris update > /opt/wo74/apt-planned-uris.txt
bash /tmp/wo74-check-uris.sh < /opt/wo74/apt-planned-uris.txt
apt-get update
# Record the exact authenticated local indexes selected by apt.
apt-get indextargets --format '$(URI)|$(FILENAME)' > /opt/wo74/apt-consumed-indexes.txt
apt-get install -y ca-certificates curl python3
cp ./*.whl wheels/
# Genuine curl configuration only bounds downloads; it does not rewrite URLs or TLS.
printf 'connect-timeout = 15\nmax-time = 120\nretry = 1\n' > /root/.curlrc
export UV_DOWNLOAD_URL=file:///opt/wo74 UV_PYTHON_PREFERENCE=only-system UV_OFFLINE=1 UV_FIND_LINKS=/opt/wo74/wheels
# Exercise the remote installer path that the unchanged official verifier will use.
curl -LsSf https://astral.sh/uv/0.9.7/install.sh -o /tmp/wo74-actual-installer.sh
cmp uv-installer.sh /tmp/wo74-actual-installer.sh
sh /tmp/wo74-actual-installer.sh
source /root/.local/bin/env
uv --version
uvx --with pytest==8.4.1 --with pytest-json-ctrf==0.3.5 pytest --version
dpkg-query -W -f='${Package}\t${Version}\t${Architecture}\n'
find /root/.cache/uv -type d -name '*.dist-info' | sort
rm /tmp/wo74-actual-installer.sh /tmp/wo74-prepare.sh /tmp/wo74-check-uris.sh
for path in /app/hello.txt /tests /solution /logs /app/.pytest_cache; do test ! -e "$path"; done
test -z "$(ls -A /app)"
