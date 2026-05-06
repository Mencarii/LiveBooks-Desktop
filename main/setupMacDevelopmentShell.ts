import { Menu, MenuItemConstructorOptions, shell } from 'electron';
import { MAC_DEV_APP_LABEL } from './macDevBranding';

/**
 * Unpackaged Electron on macOS uses the host bundle name for the default app menu.
 * Replacing the application menu fixes standard items; the menu bar title may still
 * read "Electron" until a packaged .app is used. About panel is set in configureMacAboutPanel.
 */
export function configureMacDevelopmentShell(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMacDevMenuTemplate()));
}

function buildMacDevMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: MAC_DEV_APP_LABEL,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [{ role: 'close' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Speech',
          submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'LiveBooks Website',
          click: () => {
            shell.openExternal('https://mencarii.com').catch(() => {
              /* ignore */
            });
          },
        },
      ],
    },
  ];
}
