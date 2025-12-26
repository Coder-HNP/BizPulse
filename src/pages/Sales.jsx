import React, { useState } from 'react';
import { useFirestore } from '../hooks/useFirestore';
import { useOrganization } from '../contexts/OrganizationContext';
import { db } from '../lib/firebase';
import { collection, addDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Truck, Plus } from 'lucide-react';
import { Modal } from '../components/common/Modal';

export default function Sales() {
    const { data: sales, loading: salesLoading } = useFirestore('sales_orders');
    const { data: inventory } = useFirestore('inventory_items');
    const { organization } = useOrganization();

    const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
    const [newOrder, setNewOrder] = useState({
        customerName: '',
        items: [] // { productId, productName, quantity, unitPrice }
    });
    const [orderItem, setOrderItem] = useState({ productId: '', quantity: 1, unitPrice: 0 });

    const [loading, setLoading] = useState(false);

    // Add item to new order
    function handleAddItem(e) {
        e.preventDefault();
        if (!orderItem.productId || orderItem.quantity <= 0) return;

        const product = inventory.find(i => i.productId === orderItem.productId || i.id === orderItem.productId);
        const productName = product?.productName || product?.name || 'Unknown Product';

        const item = {
            ...orderItem,
            productName
        };

        setNewOrder(prev => ({ ...prev, items: [...prev.items, item] }));
        setOrderItem({ productId: '', quantity: 1, unitPrice: 0 });
    }

    async function handleCreateOrder(e) {
        e.preventDefault();
        if (!newOrder.customerName || newOrder.items.length === 0) return;

        setLoading(true);
        try {
            const totalAmount = newOrder.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

            await addDoc(collection(db, 'sales_orders'), {
                ...newOrder,
                totalAmount,
                status: 'pending', // pending, delivered, cancelled
                orgId: organization.id,
                createdAt: serverTimestamp()
            });

            setIsNewOrderOpen(false);
            setNewOrder({ customerName: '', items: [] });
        } catch (err) {
            console.error(err);
            alert("Failed to create order");
        }
        setLoading(false);
    }

    async function handleDeliver(order) {
        if (!window.confirm(`Confirm delivery for Order? This will deduct inventory and create a receivable.`)) return;
        setLoading(true);
        try {
            await runTransaction(db, async (transaction) => {
                // PHASE 1: ALL READS FIRST
                const inventoryReads = [];

                // Read all inventory items
                for (const item of order.items) {
                    const invRef = doc(db, 'inventory_items', item.productId);
                    inventoryReads.push({
                        ref: invRef,
                        doc: await transaction.get(invRef),
                        orderItem: item
                    });
                }

                // PHASE 2: VALIDATE AND CALCULATE
                let totalCOGS = 0;
                const inventoryUpdates = [];

                for (const { ref, doc: invDoc, orderItem } of inventoryReads) {
                    if (!invDoc.exists()) {
                        throw `Inventory not found for ${orderItem.productName}`;
                    }

                    const invData = invDoc.data();
                    if (invData.quantity < orderItem.quantity) {
                        throw `Insufficient stock for ${orderItem.productName}. Available: ${invData.quantity}`;
                    }

                    // COGS Calculation
                    const currentAvgCost = invData.averageCost || 0;
                    totalCOGS += (currentAvgCost * orderItem.quantity);

                    inventoryUpdates.push({
                        ref,
                        newQty: invData.quantity - orderItem.quantity,
                        productId: orderItem.productId,
                        quantity: orderItem.quantity
                    });
                }

                // PHASE 3: ALL WRITES
                // Update inventory
                for (const update of inventoryUpdates) {
                    transaction.update(update.ref, {
                        quantity: update.newQty,
                        lastUpdated: serverTimestamp()
                    });

                    // Log inventory outflow
                    const logRef = doc(collection(db, 'inventory_logs'));
                    transaction.set(logRef, {
                        orgId: organization.id,
                        itemId: update.productId,
                        type: 'sale_delivery',
                        quantityChange: -update.quantity,
                        relatedOrderId: order.id,
                        timestamp: new Date().toISOString()
                    });
                }

                // Create receivable
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30);

                const receivableRef = doc(collection(db, 'receivables'));
                transaction.set(receivableRef, {
                    orgId: organization.id,
                    orderId: order.id,
                    customerName: order.customerName,
                    totalAmount: order.totalAmount,
                    paidAmount: 0,
                    dueAmount: order.totalAmount,
                    issueDate: new Date().toISOString(),
                    dueDate: dueDate.toISOString(),
                    status: 'unpaid'
                });

                // Update order status
                const orderRef = doc(db, 'sales_orders', order.id);
                transaction.update(orderRef, {
                    status: 'delivered',
                    deliveredAt: serverTimestamp(),
                    totalCost: totalCOGS
                });
            });
            alert("Order Delivered & Receivable Created!");
        } catch (err) {
            console.error(err);
            alert("Delivery failed: " + err);
        }
        setLoading(false);
    }

    if (salesLoading) return <div className="p-4">Loading sales...</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Sales Orders</h1>
                <button
                    onClick={() => setIsNewOrderOpen(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
                >
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
                    New Order
                </button>
            </div>

            <div className="bg-white shadow overflow-hidden sm:rounded-md">
                <ul className="divide-y divide-gray-200">
                    {sales.map((order) => (
                        <li key={order.id} className="block hover:bg-gray-50">
                            <div className="px-4 py-4 sm:px-6">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium text-indigo-600 truncate">
                                        {order.customerName}
                                    </div>
                                    <div className="ml-2 flex-shrink-0 flex">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${order.status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-2 sm:flex sm:justify-between">
                                    <div className="sm:flex">
                                        <p className="flex items-center text-sm text-gray-500">
                                            Total: ₹{order.totalAmount?.toLocaleString()}
                                        </p>
                                        <p className="mt-2 flex items-center text-sm text-gray-500 sm:mt-0 sm:ml-6">
                                            Items: {order.items?.length}
                                        </p>
                                    </div>
                                    <div className="mt-2 flex items-center text-sm sm:mt-0">
                                        {order.status === 'pending' && (
                                            <button
                                                onClick={() => handleDeliver(order)}
                                                disabled={loading}
                                                className="inline-flex items-center px-3 py-1 border border-transparent rounded-md shadow-sm text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                                            >
                                                <Truck className="mr-1 h-3 w-3" />
                                                Deliver & Invoice
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </li>
                    ))}
                    {sales.length === 0 && <li className="p-4 text-center text-gray-500">No Sales Orders</li>}
                </ul>
            </div>

            {/* New Order Modal */}
            <Modal isOpen={isNewOrderOpen} onClose={() => setIsNewOrderOpen(false)} title="Create New Sales Order">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Customer Name</label>
                        <input
                            type="text" className="mt-1 block w-full rounded-md border-gray-300 shadow-sm border p-2"
                            value={newOrder.customerName}
                            onChange={e => setNewOrder({ ...newOrder, customerName: e.target.value })}
                        />
                    </div>

                    <div className="border-t pt-2">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Add Items</h4>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            <select
                                className="col-span-1 rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                                value={orderItem.productId}
                                onChange={e => setOrderItem({ ...orderItem, productId: e.target.value })}
                            >
                                <option value="">Select Product...</option>
                                {inventory.map(i => (
                                    <option key={i.id} value={i.id}>{i.productName || i.id} (Stock: {i.quantity})</option>
                                ))}
                            </select>
                            <input
                                type="number" placeholder="Qty" className="rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                                value={orderItem.quantity}
                                onChange={e => setOrderItem({ ...orderItem, quantity: parseFloat(e.target.value) })}
                            />
                            <input
                                type="number" placeholder="Price/Unit" className="rounded-md border-gray-300 shadow-sm border p-1 text-sm"
                                value={orderItem.unitPrice}
                                onChange={e => setOrderItem({ ...orderItem, unitPrice: parseFloat(e.target.value) })}
                            />
                        </div>
                        <button onClick={handleAddItem} className="mb-4 text-sm text-indigo-600 hover:text-indigo-900">+ Add Line Item</button>

                        {/* List items added so far */}
                        {newOrder.items.length > 0 && (
                            <ul className="bg-gray-50 p-2 rounded text-sm space-y-1 mb-4">
                                {newOrder.items.map((it, idx) => (
                                    <li key={idx} className="flex justify-between">
                                        <span>{it.productName} x {it.quantity}</span>
                                        <span>₹{it.quantity * it.unitPrice}</span>
                                    </li>
                                ))}
                                <li className="font-bold border-t pt-1 flex justify-between">
                                    <span>Total</span>
                                    <span>₹{newOrder.items.reduce((s, i) => s + (i.quantity * i.unitPrice), 0)}</span>
                                </li>
                            </ul>
                        )}
                    </div>

                    <div className="mt-5 sm:mt-6">
                        <button
                            onClick={handleCreateOrder}
                            disabled={loading}
                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 sm:text-sm disabled:opacity-50"
                        >
                            {loading ? 'Processing...' : 'Create Order'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
