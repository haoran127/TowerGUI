using UnityEngine;

namespace TowerUI
{
    /// <summary>
    /// Example showing how to use a generated Proxy with DataBridge
    /// to push server data into the TowerGUI JS runtime.
    ///
    /// Flow:
    ///   Server Data → C# Proxy.FillFromServer() → DataBridge.Push() → JS Store → UI auto-update
    ///
    /// In production, replace ProtoData with actual protobuf-deserialized data.
    /// </summary>
    public class ProxyDataBridgeExample : MonoBehaviour
    {
        void Start()
        {
            SimulateServerData();
        }

        void SimulateServerData()
        {
            DataBridge.BeginBatch();

            DataBridge.Push("player.name", "TestHero");
            DataBridge.Push("player.level", 42);
            DataBridge.Push("player.gold", 12500);
            DataBridge.Push("player.avatar", "Icons/avatar_01");

            DataBridge.Push("inventory.items", new[]
            {
                new ItemData { id = "sword_01", name = "Fire Sword", icon = "Items/sword_fire", count = 1 },
                new ItemData { id = "potion_hp", name = "HP Potion", icon = "Items/potion_hp", count = 99 },
            });

            DataBridge.EndBatch();

            Debug.Log("[ProxyExample] Pushed sample data via DataBridge");
        }

        [System.Serializable]
        struct ItemData
        {
            public string id;
            public string name;
            public string icon;
            public int count;
        }

        /// <summary>
        /// Call this from a button event or network callback to demonstrate
        /// how a generated Proxy class would push data.
        /// </summary>
        public void OnBuyItem(string itemId)
        {
            DataBridge.Push($"events.onBuy", $"{{\"itemId\":\"{itemId}\"}}");
        }
    }
}
