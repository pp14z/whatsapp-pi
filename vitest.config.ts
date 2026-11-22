import { configDefaults, defineConfig } from 'vitest/config';

function resolveLocalJsImports() {
    return {
        name: 'resolve-local-js-imports',
        async resolveId(source: string, importer: string | undefined) {
            if (!importer || !source.startsWith('.') || !source.endsWith('.js')) {
                return null;
            }

            const tsSource = `${source.slice(0, -3)}.ts`;
            const resolved = await this.resolve(tsSource, importer, { skipSelf: true });
            return resolved?.id ?? null;
        }
    };
}

export default defineConfig({
    plugins: [resolveLocalJsImports()],
    test: {
        // vendor/ holds the whisper.cpp checkout built by scripts/build-whisper-cli.sh.
        // Its own spec files are not part of this project's suite, and collecting
        // them fails on dev-only dependencies that are never installed here.
        exclude: [...configDefaults.exclude, 'vendor/**']
    }
});
