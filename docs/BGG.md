# BoardGameGeek connection

Open **Settings → Data Sync → BoardGameGeek**, enter your **BGG API key**, and select **Save key**. That is all the setup required. Replace the key in the same field, or select **Forget key** to remove it from this device.

The key stays in this browser’s local storage (`gameTimer.bggToken.v1`), separately from game data. It is excluded from backups and GitHub Sync. Game Timer sends it only to `https://boardgamegeek.com/xmlapi2/` as an Authorization header. Erasing all app data also removes it.

Library’s **BGG info** and the game dialogs’ **Get BGG info** let you search for a title or fetch by BGG ID/page link. Review the current and BGG values, then apply only the checked fields. New-game forms are filled for review before saving; applying in an existing editor uses its normal autosave behavior. Manual paste remains optional.

Imports cover names, year, BGG ID/rating, player/time limits, weight, mechanisms, expansions, and player-count recommendations. The largest vote wins for each fixed player count; ties stay neutral and open-ended counts are skipped. Missing/unrated values preserve existing fields. Empty mechanism/expansion lists can clear those lists if checked. Alternative names start unchecked. Owners, personal ratings, notes, colors, types, and history are preserved.

Successful results are cached in memory while the app is open (searches for one hour; details for 24 hours), and new requests are spaced five seconds apart. Closing the dialog or canceling prevents late results from changing the preview. Saved games work offline; fetching new info requires a connection. Failed requests show instructions to retry or check the saved key.

API reference: [Using the XML API](https://boardgamegeek.com/using_the_xml_api), [XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2).
