"""Verify documentation and provenance in the actual distributable archives."""
import json
import tarfile
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parent.parent
notice = (root / 'docs/SOURCE-NOTICE.md').read_bytes()
license_text = (root / 'LICENSE').read_bytes()
checked = []
for path in sorted((root / 'artifacts/npm').glob('*.tgz')):
    with tarfile.open(path) as archive:
        readme = archive.extractfile('package/README.md').read()
        assert len(readme) > 100, f'Missing useful README: {path.name}'
        assert archive.extractfile('package/SOURCE-NOTICE.md').read() == notice, path.name
        package = json.load(archive.extractfile('package/package.json'))
        assert package['license'] == 'MIT', f'Unapproved license: {path.name}'
        assert archive.extractfile('package/LICENSE').read() == license_text, path.name
        assert package['repository']['url'] == 'git+https://github.com/binaryquest/bqAtlas.git', path.name
        checked.append(package['name'])
for path in sorted((root / 'artifacts/nuget').glob('*.nupkg')):
    with zipfile.ZipFile(path) as archive:
        metadata = ET.fromstring(archive.read(next(name for name in archive.namelist() if name.endswith('.nuspec'))))
        readme = metadata.find('.//{*}readme')
        assert readme is not None and readme.text == 'README.md', path.name
        assert len(archive.read(readme.text)) > 100, path.name
        assert archive.read('SOURCE-NOTICE.md') == notice, path.name
        assert archive.read('LICENSE') == license_text, path.name
        assert metadata.find('.//{*}license').text == 'MIT', path.name
        assert metadata.find('.//{*}repository').attrib['url'] == 'https://github.com/binaryquest/bqAtlas', path.name
        checked.append(metadata.find('.//{*}id').text)
assert len(checked) == 10, f'Expected ten artifacts, found {len(checked)}'
print('Verified MIT license, repository metadata, README and source notice in all ten npm/NuGet archives.')
