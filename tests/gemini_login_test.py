import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from gemini_login import extract_url


class GoogleAuthorizationLinkTests(unittest.TestCase):
    def test_plain_oauth_link(self):
        url = 'https://accounts.google.com/o/oauth2/auth?state=example&code_challenge=test'
        self.assertEqual(extract_url('Open: ' + url + '\n'), url)

    def test_colored_oauth_v2_link(self):
        url = 'https://accounts.google.com/o/oauth2/v2/auth?state=example'
        self.assertEqual(extract_url('\x1b[32m' + url + '\x1b[0m\n'), url)

    def test_terminal_hyperlink_with_hidden_url(self):
        url = 'https://accounts.google.com/o/oauth2/auth?state=example'
        self.assertEqual(extract_url('\x1b]8;;' + url + '\x1b\\Open Google sign-in\x1b]8;;\x1b\\'), url)

    def test_unapproved_terminal_link(self):
        self.assertIsNone(extract_url('\x1b]8;;https://accounts.google.com.evil.test/oauth\x1b\\Google sign-in\x1b]8;;\x1b\\'))

    def test_authorization_code_is_not_a_link(self):
        self.assertIsNone(extract_url('4/abcdefghijklmnop'))


if __name__ == '__main__':
    unittest.main()
