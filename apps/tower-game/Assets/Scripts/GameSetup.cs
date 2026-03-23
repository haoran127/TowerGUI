using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using TowerUI;

/// <summary>
/// Tower Guardians — a clicker demo powered by TowerUIRenderer.
/// No scene setup needed: auto-creates Canvas + EventSystem + TowerUIRenderer at startup.
/// </summary>
public class GameSetup : MonoBehaviour
{
    static TowerUIRenderer _renderer;

    // ── Game State ───────────────────────────────
    int _gold, _atk = 1, _def = 1, _maxHp = 100;
    int _wave = 1, _kills, _critChance;
    bool _autoAttack;
    float _autoTimer, _comboTimer, _msgTimer;
    int _combo;
    int _enemyHp, _enemyMaxHp;
    int _costAtk = 10, _costDef = 10, _costHp = 15, _costAuto = 50, _costCrit = 100;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void Bootstrap()
    {
        if (FindAnyObjectByType<GameSetup>() != null) return;

        var canvas = FindAnyObjectByType<Canvas>();
        if (canvas == null)
        {
            var go = new GameObject("Canvas");
            canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            go.AddComponent<CanvasScaler>();
            go.AddComponent<GraphicRaycaster>();
        }

        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

        _renderer = canvas.gameObject.GetComponent<TowerUIRenderer>();
        if (_renderer == null)
            _renderer = canvas.gameObject.AddComponent<TowerUIRenderer>();
        _renderer.SetDocumentPath("game-main.tower.json");

        var game = new GameObject("Game");
        game.AddComponent<GameSetup>();
    }

    void Start()
    {
        if (_renderer == null)
        {
            Debug.LogError("[Game] No TowerUIRenderer");
            return;
        }

        _renderer.onButtonClick += OnButton;

        var jsonPath = System.IO.Path.Combine(Application.streamingAssetsPath, "game-main.tower.json");
        if (!System.IO.File.Exists(jsonPath))
        {
            Debug.LogError($"[Game] Missing {jsonPath}");
            return;
        }
        _renderer.Build(System.IO.File.ReadAllText(jsonPath));

        SpawnEnemy();
        RefreshAll();
    }

    void Update()
    {
        if (_renderer == null) return;

        if (_autoAttack)
        {
            _autoTimer += Time.deltaTime;
            float interval = Mathf.Max(0.1f, 1f / (1f + _atk * 0.1f));
            if (_autoTimer >= interval) { _autoTimer = 0f; Attack(); }
        }

        if (_comboTimer > 0f)
        {
            _comboTimer -= Time.deltaTime;
            if (_comboTimer <= 0f) { _combo = 0; _renderer.SetText("comboText", ""); }
        }

        if (_msgTimer > 0f)
        {
            _msgTimer -= Time.deltaTime;
            if (_msgTimer <= 0f) _renderer.SetText("msgText", "");
        }
    }

    // ── Buttons ──────────────────────────────────
    void OnButton(string id)
    {
        switch (id)
        {
            case "btnAttack": Attack(); break;
            case "btnUpAtk":  Buy(ref _atk, ref _costAtk, 1, 1.5f, "ATK"); break;
            case "btnUpDef":  Buy(ref _def, ref _costDef, 1, 1.5f, "DEF"); break;
            case "btnUpHp":   Buy(ref _maxHp, ref _costHp, 20, 1.4f, "HP"); break;
            case "btnAuto":   BuyAuto(); break;
            case "btnCrit":   BuyCrit(); break;
        }
    }

    // ── Combat ───────────────────────────────────
    void Attack()
    {
        int dmg = _atk;
        bool crit = _critChance > 0 && Random.Range(0, 100) < _critChance;
        if (crit) dmg *= 3;

        _enemyHp = Mathf.Max(0, _enemyHp - dmg);
        _combo++;
        _comboTimer = 2f;

        _renderer.SetText("comboText",
            crit ? $"CRIT x{_combo}! -{dmg}" :
            _combo > 1 ? $"Combo x{_combo}! -{dmg}" : $"-{dmg}");

        if (_enemyHp <= 0) OnKill();
        RefreshHP();
    }

    void OnKill()
    {
        _kills++;
        int reward = 5 + _wave * 2;
        _gold += reward;
        Msg($"Enemy defeated! +{reward} gold");

        if (_kills % 5 == 0) { _wave++; Msg($"Wave {_wave}! Enemies grow stronger!"); }
        SpawnEnemy();
        RefreshAll();
    }

    void SpawnEnemy()
    {
        _enemyMaxHp = 8 + _wave * 5 + _wave * _wave;
        _enemyHp = _enemyMaxHp;
    }

    // ── Upgrades ─────────────────────────────────
    void Buy(ref int stat, ref int cost, int amount, float scale, string label)
    {
        if (_gold < cost) { Msg($"Need {cost} gold!"); return; }
        _gold -= cost;
        stat += amount;
        cost = Mathf.RoundToInt(cost * scale);
        Msg($"{label} → {stat}!");
        RefreshAll();
    }

    void BuyAuto()
    {
        if (_autoAttack) { Msg("Already ON!"); return; }
        if (_gold < _costAuto) { Msg($"Need {_costAuto} gold!"); return; }
        _gold -= _costAuto;
        _autoAttack = true;
        Msg("Auto-attack ON!");
        RefreshAll();
    }

    void BuyCrit()
    {
        if (_critChance >= 80) { Msg("Crit maxed!"); return; }
        if (_gold < _costCrit) { Msg($"Need {_costCrit} gold!"); return; }
        _gold -= _costCrit;
        _critChance += 10;
        _costCrit = Mathf.RoundToInt(_costCrit * 1.6f);
        Msg($"Crit → {_critChance}%!");
        RefreshAll();
    }

    // ── UI ───────────────────────────────────────
    void RefreshAll()
    {
        _renderer.SetText("goldText", TowerFormatUtils.FormatNumber(_gold));
        _renderer.SetText("waveText", $"Wave {_wave}");
        _renderer.SetText("atkText", $"ATK:  {TowerFormatUtils.FormatNumber(_atk)}");
        _renderer.SetText("defText", $"DEF:  {TowerFormatUtils.FormatNumber(_def)}");
        _renderer.SetText("hpMaxText", $"HP:   {TowerFormatUtils.FormatNumber(_maxHp)}");
        _renderer.SetText("killsText", $"Kills: {TowerFormatUtils.FormatNumber(_kills)}");
        float dps = _autoAttack ? _atk * (1f + _atk * 0.1f) : 0f;
        _renderer.SetText("dpsText", $"DPS:  {TowerFormatUtils.FormatNumber(dps)}");
        _renderer.SetText("autoText", _autoAttack ? "Auto: ON" : "Auto: OFF");
        _renderer.SetText("attackInfo",
            $"Click to deal {TowerFormatUtils.FormatNumber(_atk)} damage" + (_critChance > 0 ? $" ({_critChance}% crit)" : ""));
        _renderer.SetText("btnUpAtk", $"+ATK    {TowerFormatUtils.FormatNumber(_costAtk)}g");
        _renderer.SetText("btnUpDef", $"+DEF    {TowerFormatUtils.FormatNumber(_costDef)}g");
        _renderer.SetText("btnUpHp", $"+HP     {TowerFormatUtils.FormatNumber(_costHp)}g");
        _renderer.SetText("btnAuto", _autoAttack ? "Auto: ON" : $"Auto ATK  {TowerFormatUtils.FormatNumber(_costAuto)}g");
        _renderer.SetText("btnCrit", _critChance >= 80 ? "Crit: MAX" : $"Crit%    {TowerFormatUtils.FormatNumber(_costCrit)}g");
        RefreshHP();
    }

    void RefreshHP()
    {
        _renderer.SetText("enemyHpText", $"HP: {TowerFormatUtils.FormatNumber(_enemyHp)}/{TowerFormatUtils.FormatNumber(_enemyMaxHp)}");
        var fill = _renderer.FindNode("hpBarFill");
        if (fill != null)
        {
            var rt = fill.GetComponent<RectTransform>();
            if (rt != null)
            {
                float pct = _enemyMaxHp > 0 ? (float)_enemyHp / _enemyMaxHp : 0f;
                rt.sizeDelta = new Vector2(320f * pct, 16f);
            }
        }
    }

    void Msg(string s) { _renderer.SetText("msgText", s); _msgTimer = 3f; }

    void OnDestroy() { if (_renderer != null) _renderer.onButtonClick -= OnButton; }
}
