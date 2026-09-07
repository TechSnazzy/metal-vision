import datetime as dt
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

    def test_live_picks_and_unmatched_songs(self):
        songs=[dict(id='1',key='a|song',artist='A',title='Song'),dict(id='2',key='b|song',artist='B',title='Song')]
        tracks=c.make_tracks(songs, {'a|song':dict(videoId='sidL7S09jsc',duration=300,kind='Live performance')})
        self.assertEqual(len(tracks),1)
        self.assertEqual(tracks[0]['kind'],'Live performance')

    def test_editions_freeze_and_future_rebuilds(self):
        now=dt.datetime(2026,9,6,12,tzinfo=c.UTC)
        old=c.editions_for([],['old'],now)
        new=c.editions_for(old,['new'],now)
        self.assertEqual(new[0]['tracks'],['old'])
        self.assertEqual(new[1]['tracks'],['new'])
        tomorrow=c.editions_for(new,['newer'],now+dt.timedelta(days=1))
        self.assertEqual(tomorrow[1]['tracks'],['new'])
        self.assertEqual(tomorrow[2]['tracks'],['newer'])

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
