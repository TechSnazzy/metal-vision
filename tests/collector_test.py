import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1] / 'scripts/collect.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


class CollectorTest(unittest.TestCase):
    def test_artist_aliases_and_years(self):
        self.assertEqual(c.key(' Mötley Crüe ', 'Home Sweet Home [Live] (99)'), c.key('Motley Crue', 'Home Sweet Home'))
        self.assertEqual(c.key('Joan Jett & the Blackhearts', 'A'), c.key('Joan Jett and the Blackhearts', 'A'))
        self.assertEqual(c.clean_title('1984 (84)'), '1984')

    def test_order_jingles_and_repeat_plays(self):
        rows=[dict(id=3,ts=3000,author='A',title='Song (89)',length=180000),
              dict(id=2,ts=2000,author='HAIR BAND RADIO',title='Station ID',length=5000),
              dict(id=1,ts=1000,author='A',title='Song (89)',length=180000)]
        songs=c.normalize_history(rows)
        self.assertEqual([s['id'] for s in songs],['1','3'])
        self.assertEqual(len(c.merge_history(songs,songs,4000)),2)

    def test_catalog_entry_accepts_only_playable_videos(self):
        entry = c.catalog_entry('a|song', dict(artist='A', title='Song', videoId='sidL7S09jsc', duration=300, kind='Live performance'))
        self.assertEqual(entry['kind'], 'Live performance')
        self.assertIsNone(c.catalog_entry('b|song', dict(artist='B', title='Song', videoId='not-a-video-id', duration=300)))
        self.assertIsNone(c.catalog_entry('c|song', dict(artist='C', title='Song', videoId='sidL7S09jsc', duration=10)))

    def test_video_matching_does_not_accept_reactions(self):
        song={'artist':'Firehouse','title':'All She Wrote'}
        self.assertTrue(c.acceptable(song,{'title':'Firehouse - All She Wrote (Official Video)'}))
        self.assertFalse(c.acceptable(song,{'title':'Reaction to Firehouse All She Wrote official video'}))
        self.assertFalse(c.acceptable(song,{'title':'Firehouse Love of a Lifetime Official Video'}))

    def test_duration(self):
        self.assertEqual(c.seconds('PT4M30S'),270)
        self.assertEqual(c.seconds('PT1H2M3S'),3723)
        self.assertEqual(c.seconds('bad'),0)


if __name__ == '__main__':
    unittest.main()
