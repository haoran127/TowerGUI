using UnityEngine;
using System.Collections.Generic;

namespace TowerUI
{
    /// <summary>
    /// Generic UI object pool. Reuse GameObjects instead of Instantiate/Destroy.
    /// Useful for list items, damage numbers, toast notifications, etc.
    /// </summary>
    public class TowerUIPool
    {
        private readonly GameObject _prefab;
        private readonly Transform _poolRoot;
        private readonly Queue<GameObject> _available = new();
        private readonly HashSet<GameObject> _active = new();
        private readonly int _maxSize;
        private int _totalCreated;

        public TowerUIPool(GameObject prefab, Transform poolRoot, int initialSize = 0, int maxSize = 200)
        {
            _prefab = prefab;
            _poolRoot = poolRoot;
            _maxSize = maxSize;

            for (int i = 0; i < initialSize; i++)
                Prewarm();
        }

        private void Prewarm()
        {
            var go = Object.Instantiate(_prefab, _poolRoot);
            go.SetActive(false);
            _available.Enqueue(go);
            _totalCreated++;
        }

        public GameObject Get(Transform parent = null)
        {
            GameObject go;
            if (_available.Count > 0)
            {
                go = _available.Dequeue();
            }
            else
            {
                go = Object.Instantiate(_prefab, _poolRoot);
                _totalCreated++;
            }

            go.SetActive(true);
            if (parent != null) go.transform.SetParent(parent, false);
            _active.Add(go);
            return go;
        }

        public void Return(GameObject go)
        {
            if (go == null || !_active.Remove(go)) return;

            if (_available.Count >= _maxSize)
            {
                Object.Destroy(go);
                return;
            }

            go.SetActive(false);
            go.transform.SetParent(_poolRoot, false);
            _available.Enqueue(go);
        }

        public void ReturnAll()
        {
            var list = new List<GameObject>(_active);
            foreach (var go in list) Return(go);
        }

        public void Clear()
        {
            foreach (var go in _available) if (go != null) Object.Destroy(go);
            foreach (var go in _active) if (go != null) Object.Destroy(go);
            _available.Clear();
            _active.Clear();
        }

        public int ActiveCount => _active.Count;
        public int AvailableCount => _available.Count;
        public int TotalCreated => _totalCreated;
    }

    /// <summary>
    /// MonoBehaviour-based pool manager that holds multiple named pools.
    /// </summary>
    public class TowerPoolManager : MonoBehaviour
    {
        public static TowerPoolManager Instance { get; private set; }

        private readonly Dictionary<string, TowerUIPool> _pools = new();
        private Transform _poolRoot;

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;

            _poolRoot = new GameObject("_PoolRoot").transform;
            _poolRoot.SetParent(transform, false);
            _poolRoot.gameObject.SetActive(false);
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        public TowerUIPool GetOrCreatePool(string key, GameObject prefab, int initialSize = 5, int maxSize = 200)
        {
            if (_pools.TryGetValue(key, out var pool)) return pool;
            pool = new TowerUIPool(prefab, _poolRoot, initialSize, maxSize);
            _pools[key] = pool;
            return pool;
        }

        public TowerUIPool GetPool(string key)
        {
            _pools.TryGetValue(key, out var pool);
            return pool;
        }

        public void ClearPool(string key)
        {
            if (_pools.TryGetValue(key, out var pool))
            {
                pool.Clear();
                _pools.Remove(key);
            }
        }

        public void ClearAll()
        {
            foreach (var pool in _pools.Values) pool.Clear();
            _pools.Clear();
        }
    }
}
