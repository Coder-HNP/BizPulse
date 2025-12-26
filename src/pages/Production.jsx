import React, { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, updateDoc, arrayUnion, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Plus, Factory, Settings } from 'lucide-react';
import { Modal } from '../components/common/Modal';

export default function Production() {
    const { data: products, loading: productsLoading } = useFirestore('products');
    const { data: materials, loading: materialsLoading } = useFirestore('raw_materials');
    const { organization } = useOrganization();

    const [activeTab, setActiveTab] = useState('production'); // 'production' or 'products'
    const [isAddProductOpen, setIsAddProductOpen] = useState(false);
    const [newProduct, setNewProduct] = useState({ name: '', description: '' });

    // BOM Editing state
    const [editingProduct, setEditingProduct] = useState(null); // Product being edited
    const [bomItem, setBomItem] = useState({ materialId: '', quantity: 0 });

    // Production Run State
    const [isProductionRunOpen, setIsProductionRunOpen] = useState(false);
    const [productionData, setProductionData] = useState({ productId: '', quantity: 0 });
    const [runLoading, setRunLoading] = useState(false);

    async function handleAddProduct(e) {
        e.preventDefault();
        if (!organization) return;
        try {
            await addDoc(collection(db, 'products'), {
                ...newProduct,
                orgId: organization.id,
                bom: [],
                createdAt: serverTimestamp()
            });
            setIsAddProductOpen(false);
            setNewProduct({ name: '', description: '' });
        } catch (err) {
            console.error(err);
            alert('Failed to add product');
        }
    }

    async function handleAddBomItem(e) {
        e.preventDefault();
        if (!editingProduct || !bomItem.materialId || bomItem.quantity <= 0) return;

        try {
            const material = materials.find(m => m.id === bomItem.materialId);
            const newItem = {
                materialId: bomItem.materialId,
                materialName: material?.name || 'Unknown',
                quantity: parseFloat(bomItem.quantity)
            };

            const productRef = doc(db, 'products', editingProduct.id);
            // Check if item already exists? Ideally yes.

            await updateDoc(productRef, {
                bom: arrayUnion(newItem)
            });

            // clear form
            setBomItem({ materialId: '', quantity: 0 });
            // Update local editingProduct state to reflect change? 
            // Firestore listener will update the list, but our modal relies on `editingProduct` object which might be stale.
            // We should rely on the `products` list finding the editing ID.
            setEditingProduct(prev => ({ ...prev, bom: [...(prev.bom || []), newItem] }));
        } catch (err) {
            console.error(err);
        }
    }

    async function handleProductionRun(e) {
        e.preventDefault();
        const { productId, quantity } = productionData;
        if (!productId || quantity <= 0 || !organization) return;

        const qty = parseFloat(quantity);
        const product = products.find(p => p.id === productId);
        if (!product || !product.bom || product.bom.length === 0) {
            alert("Invalid product or BOM not configured");
            return;
        }

        setRunLoading(true);
        try {
            await runTransaction(db, async (transaction) => {
                // PHASE 1: ALL READS FIRST
                const materialReads = [];

                // Read all raw materials
                for (const item of product.bom) {
                    const materialRef = doc(db, 'raw_materials', item.materialId);
                    materialReads.push({
                        ref: materialRef,
                        doc: await transaction.get(materialRef),
                        bomItem: item
                    });
                }

                // Read inventory item
                const invRef = doc(db, 'inventory_items', productId);
                const invDoc = await transaction.get(invRef);

                // PHASE 2: VALIDATE AND CALCULATE
                let totalCost = 0;
                const materialUpdates = [];

                for (const { ref, doc: materialDoc, bomItem } of materialReads) {
                    if (!materialDoc.exists()) {
                        throw `Material ${bomItem.materialName} not found`;
                    }

                    const matData = materialDoc.data();
                    const requiredQty = bomItem.quantity * qty;

                    if ((matData.quantity || 0) < requiredQty) {
                        throw `Insufficient ${matData.name}. Required: ${requiredQty}, Available: ${matData.quantity}`;
                    }

                    const newMatQty = matData.quantity - requiredQty;
                    const matCost = (matData.averageCost || 0) * requiredQty;
                    totalCost += matCost;

                    materialUpdates.push({
                        ref,
                        newQty: newMatQty,
                        materialId: bomItem.materialId,
                        materialName: matData.name,
                        requiredQty
                    });
                }

                // Calculate inventory values
                let newInvQty = qty;
                let newAvgCost = totalCost / qty;

                if (invDoc.exists()) {
                    const invData = invDoc.data();
                    const currentQty = invData.quantity || 0;
                    const currentVal = currentQty * (invData.averageCost || 0);
                    const totalVal = currentVal + totalCost;
                    newInvQty = currentQty + qty;
                    newAvgCost = totalVal / newInvQty;
                }

                // PHASE 3: ALL WRITES
                // Update raw materials
                for (const update of materialUpdates) {
                    transaction.update(update.ref, {
                        quantity: update.newQty,
                        lastUpdated: serverTimestamp()
                    });

                    // Log material usage
                    const logRef = doc(collection(db, 'raw_material_logs'));
                    transaction.set(logRef, {
                        materialId: update.materialId,
                        materialName: update.materialName,
                        type: 'production_use',
                        quantityChange: -update.requiredQty,
                        quantity: update.requiredQty,
                        productName: product.name,
                        orgId: organization.id,
                        timestamp: new Date().toISOString()
                    });
                }

                // Update or create inventory
                if (invDoc.exists()) {
                    transaction.update(invRef, {
                        quantity: newInvQty,
                        averageCost: newAvgCost,
                        lastUpdated: serverTimestamp()
                    });
                } else {
                    transaction.set(invRef, {
                        productId: productId,
                        productName: product.name,
                        quantity: newInvQty,
                        averageCost: newAvgCost,
                        unit: 'pc',
                        orgId: organization.id,
                        createdAt: serverTimestamp()
                    });
                }

                // Log inventory production
                const invLogRef = doc(collection(db, 'inventory_logs'));
                transaction.set(invLogRef, {
                    orgId: organization.id,
                    itemId: productId,
                    type: 'production',
                    quantityChange: qty,
                    cost: totalCost,
                    productName: product.name,
                    timestamp: new Date().toISOString()
                });

                // Create production order record
                const prodOrderRef = doc(collection(db, 'production_orders'));
                transaction.set(prodOrderRef, {
                    orgId: organization.id,
                    productId: productId,
                    productName: product.name,
                    quantity: qty,
                    totalCost: totalCost,
                    unitCost: totalCost / qty,
                    status: 'completed',
                    timestamp: new Date().toISOString(),
                    createdAt: serverTimestamp()
                });
            });

            setIsProductionRunOpen(false);
            setProductionData({ productId: '', quantity: 0 });
            alert("Production Run Completed Successfully!");
        } catch (err) {
            console.error(err);
            alert("Production Failed: " + err);
        }
        setRunLoading(false);
    }

    if (productsLoading || materialsLoading) return <div className="p-4">Loading...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Production Management</h1>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('production')}
                        className={`${activeTab === 'production' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Production Runs
                    </button>
                    <button
                        onClick={() => setActiveTab('products')}
                        className={`${activeTab === 'products' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
                    >
                        Products & BOM
                    </button>
                </nav>
            </div>

            {activeTab === 'products' && (
                <div>
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => setIsAddProductOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                        >
                            <Plus className="-ml-1 mr-2 h-5 w-5" />
                            New Product
                        </button>
                    </div>

                    <div className="bg-white shadow overflow-hidden sm:rounded-md">
                        <ul className="divide-y divide-gray-200">
                            {products.map((product) => (
                                <li key={product.id}>
                                    <div className="px-4 py-4 sm:px-6">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-lg font-medium leading-6 text-gray-900">{product.name}</h3>
                                                <p className="mt-1 max-w-2xl text-sm text-gray-500">{product.description}</p>
                                            </div>
                                            <button
                                                onClick={() => setEditingProduct(product)}
                                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-xs font-medium text-gray-700 bg-white hover:bg-gray-50"
                                            >
                                                <Settings className="mr-1 h-3 w-3" />
                                                Configure BOM
                                            </button>
                                        </div>
                                        <div className="mt-4">
                                            <h4 className="text-sm font-medium text-gray-500">Bill of Materials:</h4>
                                            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside">
                                                {product.bom && product.bom.length > 0 ? (
                                                    product.bom.map((item, idx) => (
                                                        <li key={idx}>{item.materialName}: {item.quantity}</li>
                                                    ))
                                                ) : (
                                                    <li className="text-gray-400 italic">No materials configured</li>
                                                )}
                                            </ul>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            {activeTab === 'production' && (
                <div>
                    <div className="flex justify-end mb-4">
                        <button
                            onClick={() => setIsProductionRunOpen(true)}
                            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                        >
                            <Factory className="-ml-1 mr-2 h-5 w-5" />
                            Start Production
                        </button>
                    </div>

                    <div className="bg-white shadow overflow-hidden sm:rounded-md p-6 text-center text-gray-500">
                        <p>Production history will appear here.</p>
                        {/* TODO: List production_orders collection */}
                    </div>
                </div>
            )}

            {/* Add Product Modal */}
            <Modal isOpen={isAddProductOpen} onClose={() => setIsAddProductOpen(false)} title="Create New Product">
                <form onSubmit={handleAddProduct}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Product Name</label>
                            <input
                                type="text" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={newProduct.name}
                                onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Description</label>
                            <textarea
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={newProduct.description}
                                onChange={e => setNewProduct({ ...newProduct, description: e.target.value })}
                            />
                        </div>
                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button type="submit" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:text-sm">
                            Create Product
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Edit BOM Modal */}
            <Modal isOpen={!!editingProduct} onClose={() => setEditingProduct(null)} title={`Configure BOM: ${editingProduct?.name}`}>
                <div className="space-y-4">
                    {/* List existing items */}
                    <div className="bg-gray-50 p-4 rounded-md">
                        <h4 className="font-medium text-sm text-gray-700 mb-2">Current BOM</h4>
                        <ul className="space-y-2">
                            {/* We use current products list to find the latest data, not just local state */}
                            {products.find(p => p.id === editingProduct?.id)?.bom?.map((item, idx) => (
                                <li key={idx} className="flex justify-between text-sm">
                                    <span>{item.materialName}</span>
                                    <span className="font-mono">{item.quantity}</span>
                                </li>
                            ))}
                            {(!products.find(p => p.id === editingProduct?.id)?.bom?.length) && <p className="text-xs text-gray-400">Empty</p>}
                        </ul>
                    </div>

                    {/* Add new item form */}
                    <form onSubmit={handleAddBomItem} className="border-t pt-4">
                        <h4 className="font-medium text-sm text-gray-700 mb-2">Add Material</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <select
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={bomItem.materialId}
                                onChange={e => setBomItem({ ...bomItem, materialId: e.target.value })}
                                required
                            >
                                <option value="">Select Material</option>
                                {materials.map(m => (
                                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                                ))}
                            </select>
                            <input
                                type="number" step="0.001" placeholder="Qty" required
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm border p-2"
                                value={bomItem.quantity}
                                onChange={e => setBomItem({ ...bomItem, quantity: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="mt-2 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
                            Add to BOM
                        </button>
                    </form>
                </div>
            </Modal>

            {/* Production Run Modal */}
            <Modal isOpen={isProductionRunOpen} onClose={() => setIsProductionRunOpen(false)} title="Start Production Run">
                <form onSubmit={handleProductionRun}>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Select Product</label>
                            <select
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                value={productionData.productId}
                                onChange={e => setProductionData({ ...productionData, productId: e.target.value })}
                                required
                            >
                                <option value="">-- Select Product --</option>
                                {products.filter(p => p.bom && p.bom.length > 0).map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-500 mt-1">Only products with configured BOM are shown.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Quantity to Produce</label>
                            <input
                                type="number" step="1" min="1" required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                                value={productionData.quantity}
                                onChange={e => setProductionData({ ...productionData, quantity: e.target.value })}
                            />
                        </div>

                        {/* Preview Requirements */}
                        {productionData.productId && productionData.quantity > 0 && (() => {
                            const prod = products.find(p => p.id === productionData.productId);
                            if (!prod) return null;
                            const qty = parseFloat(productionData.quantity);

                            return (
                                <div className="bg-blue-50 p-3 rounded text-sm">
                                    <h4 className="font-medium mb-1">Material Requirements:</h4>
                                    <ul className="space-y-1">
                                        {prod.bom.map((item, idx) => {
                                            const req = item.quantity * qty;
                                            const stockItem = materials.find(m => m.id === item.materialId);
                                            const stock = stockItem?.quantity || 0;
                                            const isEnough = stock >= req;

                                            return (
                                                <li key={idx} className={`flex justify-between ${isEnough ? 'text-blue-800' : 'text-red-600 font-bold'}`}>
                                                    <span>{item.materialName}:</span>
                                                    <span>{req} {stockItem?.unit} (Stock: {stock})</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })()}

                    </div>
                    <div className="mt-5 sm:mt-6">
                        <button
                            type="submit"
                            disabled={runLoading}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 sm:text-sm disabled:opacity-50"
                        >
                            {runLoading ? 'Processing...' : 'Confirm Production'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
