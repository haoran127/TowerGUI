using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections;

namespace TowerUI
{
    /// <summary>
    /// Diagnostic script for validating the full asset loading chain.
    /// Attach to any GameObject in the test scene, populate testPaths in Inspector.
    /// Results are logged to Console.
    /// </summary>
    public class AssetLoadTest : MonoBehaviour
    {
        [Header("Sprite Loading")]
        public string[] spriteTestPaths = { "Icons/icon_gold", "Backgrounds/main_bg" };

        [Header("SpriteAtlas Loading")]
        public string testAtlasPath = "UI/CommonAtlas";
        public string testAtlasSprite = "btn_ok";

        [Header("Font Loading")]
        public string testFontPath = "Fonts/DefaultFont SDF";

        [Header("Audio Loading")]
        public string testAudioPath = "Sounds/click";

        [Header("Fill Mode Testing")]
        public Image testFillImage;
        public Image testSlicedImage;

        private IEnumerator Start()
        {
            yield return new WaitForSeconds(0.5f);
            Debug.Log("[AssetLoadTest] ===== Starting Asset Verification =====");

            TestSpriteLoading();
            TestSpriteAtlas();
            TestFontLoading();
            TestAudioLoading();
            TestFillModes();

            #if TOWER_USE_ADDRESSABLES
            yield return TestAddressables();
            #endif

            Debug.Log("[AssetLoadTest] ===== Verification Complete =====");
            Debug.Log($"[AssetLoadTest] Cache: {AssetManager.CachedSpriteCount} sprites, {AssetManager.CachedAudioCount} audio clips");
        }

        void TestSpriteLoading()
        {
            Debug.Log("[AssetLoadTest] --- Sprite Loading ---");
            foreach (var p in spriteTestPaths)
            {
                var sprite = AssetManager.LoadSprite(p);
                var status = sprite != null ? $"OK ({sprite.rect.width}x{sprite.rect.height})" : "FAILED";
                Debug.Log($"  LoadSprite(\"{p}\"): {status}");
            }
        }

        void TestSpriteAtlas()
        {
            Debug.Log("[AssetLoadTest] --- SpriteAtlas Loading ---");
            var sprite = AssetManager.LoadSpriteFromAtlas(testAtlasPath, testAtlasSprite);
            var status = sprite != null ? $"OK ({sprite.rect.width}x{sprite.rect.height})" : "FAILED (atlas or sprite not found)";
            Debug.Log($"  LoadSpriteFromAtlas(\"{testAtlasPath}\", \"{testAtlasSprite}\"): {status}");
        }

        void TestFontLoading()
        {
            Debug.Log("[AssetLoadTest] --- Font Loading ---");
            var font = Resources.Load<TMP_FontAsset>(testFontPath);
            var status = font != null ? $"OK (glyphs: {font.glyphTable?.Count ?? 0})" : "FAILED";
            Debug.Log($"  Font \"{testFontPath}\": {status}");
        }

        void TestAudioLoading()
        {
            Debug.Log("[AssetLoadTest] --- Audio Loading ---");
            var clip = AssetManager.LoadAudio(testAudioPath);
            var status = clip != null ? $"OK ({clip.length:F2}s, {clip.channels}ch)" : "FAILED";
            Debug.Log($"  LoadAudio(\"{testAudioPath}\"): {status}");
        }

        void TestFillModes()
        {
            Debug.Log("[AssetLoadTest] --- Fill Mode Testing ---");
            if (testFillImage != null)
            {
                testFillImage.type = Image.Type.Filled;
                testFillImage.fillMethod = Image.FillMethod.Radial360;
                testFillImage.fillAmount = 0.75f;
                Debug.Log($"  Fill image: type={testFillImage.type}, fillAmount={testFillImage.fillAmount}");
            }
            else
            {
                Debug.Log("  Fill image: SKIPPED (no reference set)");
            }

            if (testSlicedImage != null)
            {
                testSlicedImage.type = Image.Type.Sliced;
                Debug.Log($"  9-Slice image: type={testSlicedImage.type}, hasBorder={testSlicedImage.sprite?.border != Vector4.zero}");
            }
            else
            {
                Debug.Log("  9-Slice image: SKIPPED (no reference set)");
            }
        }

        #if TOWER_USE_ADDRESSABLES
        IEnumerator TestAddressables()
        {
            Debug.Log("[AssetLoadTest] --- Addressables Loading ---");
            AssetManager.UseAddressables = true;

            foreach (var p in spriteTestPaths)
            {
                bool done = false;
                Sprite result = null;
                AssetManager.LoadSpriteAsync(p, (sprite) => { result = sprite; done = true; });
                float timeout = Time.time + 5f;
                while (!done && Time.time < timeout) yield return null;
                var status = result != null ? "OK" : done ? "FAILED" : "TIMEOUT";
                Debug.Log($"  LoadSpriteAsync(\"{p}\"): {status}");
            }

            AssetManager.UseAddressables = false;
        }
        #endif
    }
}
