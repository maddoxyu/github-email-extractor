## Installation

Basic Plasmo assets and Node Modules have been ignored as they remain the same towards the default provided by Plasmo. 

You can choose to download only content.tsx, background.ts, manifest.json, and package.json while downloading the rest of the Plasmo extensions needed externally as such:

Installing Plasmo and creating a project:

```
cd project-directory
pnpm create plasmo
```

Then, create a new file within called content.tsx and update package.json. 

## Running the Extension

In Windows Powershell:
```
cd project-directory
# If Script Execution is disabled
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# Otherwise, continue
npm run
# or
pnpm dev
```

In Chrome extensions, load the unpacked extension by choosing the build file and reloading the site. Extension should thus work as intended.
