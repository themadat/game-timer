# BoardGameGeek connection

Open **Settings → Data Sync → BoardGameGeek**, enter your **BGG API key**, and select **Save key**. That is all the setup required. Replace the key in the same field, or select **Forget key** to remove it from this device.

The key stays in this browser’s local storage (`gameTimer.bggToken.v1`), separately from game data. It is excluded from backups and GitHub Sync. Game Timer sends it only to `https://boardgamegeek.com/xmlapi2/` as an Authorization header. Erasing all app data also removes it.

Library’s **BGG info** and the game dialogs’ **Get BGG info** let you search for a title or fetch by BGG ID/page link. Search results show cover thumbnails for the first 20 matches, loaded in one batch. Refine the title for more specific matches; if none are found, use the Google link to search the same title on BGG. Selecting a result reuses the batch detail data. Review the current and BGG values, then apply only the checked fields. New-game forms are filled for review before saving; applying in an existing editor uses its normal autosave behavior. Manual paste remains optional.

Imports cover names, year, BGG ID/rating, player/time limits, weight, Additional Types, mechanisms, expansions, and player-count recommendations. Additional Types map the API’s recognized classification ranks to Abstract, Customizable, Thematic, Family, Children’s, Party, Strategy, and Wargames; absent classifications leave existing choices intact. The largest vote wins for each fixed player count; ties stay neutral and open-ended counts are skipped. Missing/unrated values preserve existing fields. Empty mechanism/expansion lists can clear those lists if checked. Alternative names start unchecked. Owners, personal ratings, notes, colors, Main Type, and history are preserved. Additional Types change only if their import row is checked.

Successful results are cached in memory while the app is open (searches for one hour; details for 24 hours), and new requests are spaced five seconds apart. Closing the dialog or canceling prevents late results from changing the preview. Saved games work offline; fetching new info requires a connection. Failed requests show instructions to retry or check the saved key.

API reference: [Using the XML API](https://boardgamegeek.com/using_the_xml_api), [XML API2](https://boardgamegeek.com/wiki/page/BGG_XML_API2).

Weight accepts arbitrary decimal precision within 1–5 and displays exactly two decimal places; BGG rating accepts arbitrary decimal precision within 1–10 and displays one. Storage retains the original precision, including when an unrelated editor field changes.

Wishlist game details and the game editor show **Find stores** (Google Shopping) and **Find on eBay** links using the title and published year. These are shopping searches, without affiliate codes or price/availability claims.
