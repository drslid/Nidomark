# Privacy policy

Nidomark organizes your bookmarks on your own computer. It has no account, no server and no analytics: no data leaves your computer.

## What the extension reads

- **Bookmarks** (`bookmarks` permission): titles, addresses and folders, to build the proposal and apply the new tree you approve. The folders your browser keeps for its own features (the Speed Dial and the trash of Opera and Vivaldi, Opera's Pinboards) are never read.
- **Site icons** (`favicon` permission, in Chrome, Edge, Brave, Opera and Vivaldi): the icons already cached by the browser, to display them in the review screen. Firefox shows the first letter of each site instead.
- **Bookmarked pages** (access to sites, optional): only if "Read sites when the title is not enough" or "Find sites that no longer answer" is on. Your browser asks for this access once, at the first analysis; you can refuse it, turn both options off, or revoke it at any time in the browser's extensions page (`chrome://extensions`, or `about:addons` in Firefox).
- **Your browsing history** (`history` permission, optional): only while "Put the most visited sites first" is on (it is on by default; your browser asks for this access at the first analysis). Nidomark counts the visits of each site to choose the icons of quick access and to put the most used folders first, and reads the page titles already stored by the browser to understand vague bookmark titles. The history is read on your computer, never stored by Nidomark and never sent. You can refuse the access, turn the option off, or revoke it at any time in the extension's settings or in the browser's extensions page.

## How pages are read

When the title and address of a bookmark are not enough to file it, or to check whether a site still answers, Nidomark requests **the bookmarked address itself**, exactly as your browser would open it:

- without cookies and without a referrer, so you are not signed in and the site does not learn where the request comes from;
- only the beginning of the page is read (its title, description, headings and first paragraphs), never stored;
- addresses of your local network (NAS, box, home server) and services hosted at home are never requested;
- a site cannot erase its cookies or its data in answer, as some do for a visitor they do not recognise (the Clear-Site-Data header): Chrome, Edge, Brave, Opera and Vivaldi refuse it for a request without cookies, and in Firefox Nidomark removes that header from the answers to its own requests. In developer mode, Chrome lists the refusal among the extension's errors (`Clear-Site-Data header on '…': The request's credentials mode prohibits modifying cookies and other local data.`): that message means you stayed signed in;
- when a page says too little about itself, the home page of the same site may be read as well;
- nothing about your bookmarks or your collection is sent anywhere: the only network traffic is the page request, the same one a visit would make. The site sees your IP address, as it would during a visit.

## What the extension stores

Everything is stored locally, in the extension's storage on your computer:

- your settings;
- the journal of the last sort, used to undo it;
- the original names of bookmarks shown as icon only, to show them again;
- the categories you chose instead of the proposal, by address and by site, used to improve the next proposals (undoing a sort forgets the ones it recorded);
- the folders Nidomark created, with their names, to recognise them at the next sort;
- the list of the backups it made;
- a cache of the numbers (vectors) computed by the model for each bookmark text.

A sort recreates your bookmarks in a new tree and moves the previous tree, as it was, into a backup folder **among your bookmarks** ("Nidomark backup – date" in Other bookmarks). If you use your browser's sync, the backup is synced like any bookmark, so your bookmarks count twice until you delete it. Delete it from the settings, or from the bookmarks manager, when you no longer need it; after that, the sort can no longer be undone.

When "One copy of each page" is on, copies of a page that is kept elsewhere are not recreated: they stay in the backup, and undoing the sort puts them back with the rest.

"Clear the analysis cache" in the settings deletes the cache. Removing the extension deletes all of its data (the backup folders, being bookmarks, stay until you delete them).

## What the extension sends

Nothing. The model and its runtime are packaged with the extension and run offline. Apart from the page requests described above, which you can turn off, the extension makes no network request. It does not sell or share data and does not use it for any purpose other than organizing your bookmarks.

## Contact

Open an issue on [GitHub](https://github.com/drslid/Nidomark/issues).
