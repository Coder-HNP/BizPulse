import React, { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Plus, ShoppingCart } from 'lucide-react';
import { Modal } from '../components/common/Modal';

export default function RawMaterials() {
    const { data: materials, loading, error } = useFirestore('raw_materials');
    const { organization } = useOrganization();

    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isPurchaseOpen, setIsPurchaseOpen] = useState(false);
    const [selectedMaterial, setSelectedMaterial] = useState(null);

    // Form states
    const [newItem, setNewItem] = useState({ name: '', unit: 'kg', minStock: 0 });
    const [purchaseData, setPurchaseData] = useState({ quantity: 0, totalCost: 0 });
    const [actionLoading, setActionLoading] = useState(false);

    async function handleAddMaterial(e) {
        e.preventDefault();
        if (!organization) return;
        setActionLoading(true);
        try {
            await addDoc(collection(db, 'raw_materials'), {
                ...newItem,
                orgId: organization.id,
                quantity: 0,
                averageCost: 0,
                createdAt: serverTimestamp()
            });
            setIsAddOpen(false);
            setNewItem({ name: '', unit: 'kg', minStock: 0 });
        } catch (err) {
            console.error(err);
            alert('Failed to add material');
        }
        setActionLoading(false);
    }

    async function handlePurchase(e) {
        e.preventDefault();
        if (!selectedMaterial || !organization) return;
        setActionLoading(true);

        try {
            const quantity = parseFloat(purchaseData.quantity);
            const cost = parseFloat(purchaseData.totalCost); // Total cost for the batch

            if (quantity <= 0 || cost < 0) throw new Error("Invalid quantity or cost");

            await runTransaction(db, async (transaction) => {
                const materialRef = doc(db, 'raw_materials', selectedMaterial.id);
                const materialDoc = await transaction.get(materialRef);
                if (!materialDoc.exists()) throw "Document does not exist!";

                const data = materialDoc.data();
                const currentQty = data.quantity || 0;
                const currentAvgCost = data.averageCost || 0;
                const currentTotalValue = currentQty * currentAvgCost;

                const newTotalValue = currentTotalValue + cost; // Total value increases by purchase cost
                const newQty = currentQty + quantity;
                const newAvgCost = newQty > 0 ? newTotalValue / newQty : 0;

                transaction.update(materialRef, {
                    quantity: newQty,
                    averageCost: newAvgCost,
                    lastUpdated: serverTimestamp()
                });

                // Add Log
                const logRef = doc(collection(db, 'raw_material_logs'));
                transaction.set(logRef, {
                    materialId: selectedMaterial.id,
                    materialName: data.name,
                    type: 'purchase', // IN
                    quantityChange: quantity,
                    cost: cost, // Total cost of this purchase
                    unitCost: cost / quantity,
                    newQuantity: newQty,
                    newAvgCost: newAvgCost,
                    orgId: organization.id,
                    timestamp: new Date().toISOString() // Use simpler ISO string for easier sorting/filtering client side or serverTimestamp
                });

                // Add Cashflow Outflow Log
                const cfRef = doc(collection(db, 'cashflow_entries'));
                transaction.set(cfRef, {
                    orgId: organization.id,
                    type: 'outflow',
                    category: 'purchase',
                    amount: cost,
                    description: `Purchase: ${data.name} (${quantity} ${data.unit})`,
                    timestamp: new Date().toISOString() // Consistent timestamping
                });
            });

            setIsPurchaseOpen(false);
            setPurchaseData({ quantity: 0, totalCost: 0 });
        } catch (err) {
            console.error(err);
            alert('Failed to record purchase: ' + err.message);
        }
        setActionLoading(false);
    }

    if (loading) return <div className="p-4">Loading materials...</div>;
    if (error) return <div className="p-4 text-red-600">Error loading materials</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Raw Materials</h1>
                <button
                    onClick={() => setIsAddOpen(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                    Add Material
                </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                    {materials.map((material) => (
                        <li key={material.id}>
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <div className="truncate">
                                        <div className="flex text-sm">
                                            <p className="font-medium text-indigo-600 truncate">{material.name}</p>
                                            <p className="ml-1 flex-shrink-0 font-normal text-gray-500">
                                                In Stock: {material.quantity?.toFixed(2)} {material.unit}
                                            </p>
                                        </div>
                                        <div className="mt-2 flex">
                                            <div className="flex items-center text-sm text-gray-500">
                                                <p>Avg Cost: ₹{material.averageCost?.toFixed(2)} / {material.unit}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="ml-2 flex-shrink-0 flex">
                                        <button
                                            onClick={() => {
                                                setSelectedMaterial(material);
                                                setIsPurchaseOpen(true);
                                            }}
                                            className="inline-flex items-center px-3 py-1.5 border border-indigo-600 rounded-md text-xs font-medium text-indigo-600 bg-white hover:bg-indigo-50"
                                        >
                                            <ShoppingCart className="mr-1 h-3 w-3" />
                                            Purchase
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                    {materials.length === 0 && (
                        <li className="px-4 py-8 text-center text-gray-500">
                            No materials found. Add one to get started.
                        </li>
                    )}
                </ul>
            </div>

            {/* Add Material Modal */}
            <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Raw Material">
                <form onSubmit={handleAddMaterial}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Name</label>
                            <input
                                type="text" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={newItem.name}
                                onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Unit</label>
                            <select
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={newItem.unit}
                                onChange={e => setNewItem({ ...newItem, unit: e.target.value })}
                            >
                                <option value="kg">kg</option>
                                <option value="ltr">ltr</option>
                                <option value="pc">pc</option>
                                <option value="mtr">mtr</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Min. Stock Alert</label>
                            <input
                                type="number"
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={newItem.minStock}
                                onChange={e => setNewItem({ ...newItem, minStock: parseFloat(e.target.value) })}
                            />
                        </div>
                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm disabled:opacity-50"
                        >
                            {actionLoading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Purchase Modal */}
            <Modal isOpen={isPurchaseOpen} onClose={() => setIsPurchaseOpen(false)} title={`Purchase: ${selectedMaterial?.name}`}>
                <form onSubmit={handlePurchase}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Quantity ({selectedMaterial?.unit})</label>
                            <input
                                type="number" step="0.01" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={purchaseData.quantity}
                                onChange={e => setPurchaseData({ ...purchaseData, quantity: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Total Cost (₹)</label>
                            <input
                                type="number" step="0.01" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={purchaseData.totalCost}
                                onChange={e => setPurchaseData({ ...purchaseData, totalCost: e.target.value })}
                            />
                        </div>
                        <div className="text-sm text-gray-500">
                            <p>New Unit Cost will be calculated based on Weighted Average.</p>
                        </div>
                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button
                            type="submit"
                            disabled={actionLoading}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:text-sm disabled:opacity-50"
                        >
                            {actionLoading ? 'Processing...' : 'Confirm Purchase'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
