## Keys

The key is used to sign the extension package, and the signature is verified by the Chrome browser when the extension is installed.

This helps prevent unauthorized or malicious modifications to the extension, as any changes to the code would invalidate the signature and prevent the extension from being installed.

To build the `.crx` file, both keys must be located under `./keys/` directory. To generate new keys use the following command:

```
openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout key.pem -out key.pub
```
