export async function openBrowser(url: string) {
  const args =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['rundll32.exe', 'url.dll,FileProtocolHandler', url]
        : ['xdg-open', url];
  try {
    const child = Bun.spawn(args, { stdout: 'ignore', stderr: 'ignore' });
    if ((await child.exited) === 0) return;
  } catch {
    // The URL remains available when no desktop browser launcher is installed.
  }
  console.error('Conduct: Browser could not open automatically. Open the review URL above.');
}
