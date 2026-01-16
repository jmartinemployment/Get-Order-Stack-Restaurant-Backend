import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

// ============ Restaurant ============

router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      slug, name, description, logo, phone, email, 
      address, city, state, zip, cuisineType, tier,
      monthlyRevenue, deliveryPercent, platformsUsed, posSystem 
    } = req.body;

    const restaurant = await prisma.restaurant.create({
      data: {
        slug, name, description, logo, phone, email,
        address, city, state, zip, cuisineType, tier,
        monthlyRevenue, deliveryPercent, platformsUsed, posSystem
      }
    });
    res.status(201).json(restaurant);
  } catch (error) {
    console.error('Error creating restaurant:', error);
    res.status(500).json({ error: 'Failed to create restaurant' });
  }
});

router.get('/:restaurantId', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId }
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }
    res.json(restaurant);
  } catch (error) {
    console.error('Error fetching restaurant:', error);
    res.status(500).json({ error: 'Failed to fetch restaurant' });
  }
});

router.get('/slug/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug }
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }
    res.json(restaurant);
  } catch (error) {
    console.error('Error fetching restaurant by slug:', error);
    res.status(500).json({ error: 'Failed to fetch restaurant' });
  }
});

// ============ Full Menu ============

router.get('/:restaurantId/menu', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { includeUnavailable } = req.query;

    const categories = await prisma.menuCategory.findMany({
      where: { 
        restaurantId,
        active: true
      },
      orderBy: { displayOrder: 'asc' },
      include: {
        menuItems: {
          where: includeUnavailable === 'true' 
            ? {} 
            : { available: true, eightySixed: false },
          orderBy: { displayOrder: 'asc' }
        }
      }
    });

    res.json(categories);
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// ============ Categories ============

router.get('/:restaurantId/menu/categories', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' }
    });
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/:restaurantId/menu/categories', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { name, description, image, active = true } = req.body;

    const maxOrder = await prisma.menuCategory.aggregate({
      where: { restaurantId },
      _max: { displayOrder: true }
    });

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId, name, description, image, active,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1
      }
    });
    res.status(201).json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.patch('/:restaurantId/menu/categories/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    const { name, description, image, active, displayOrder } = req.body;

    const category = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(image !== undefined && { image }),
        ...(active !== undefined && { active }),
        ...(displayOrder !== undefined && { displayOrder })
      }
    });
    res.json(category);
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.delete('/:restaurantId/menu/categories/:categoryId', async (req: Request, res: Response) => {
  try {
    const { categoryId } = req.params;
    await prisma.menuItem.deleteMany({ where: { categoryId } });
    await prisma.menuCategory.delete({ where: { id: categoryId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// ============ Menu Items ============

router.get('/:restaurantId/menu/items', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const items = await prisma.menuItem.findMany({
      where: { restaurantId },
      orderBy: [{ categoryId: 'asc' }, { displayOrder: 'asc' }]
    });
    res.json(items);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

router.get('/:restaurantId/menu/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: true }
    });
    if (!item) {
      res.status(404).json({ error: 'Menu item not found' });
      return;
    }
    res.json(item);
  } catch (error) {
    console.error('Error fetching menu item:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

router.post('/:restaurantId/menu/items', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { categoryId, name, description, price, cost, image, available = true, dietary = [] } = req.body;

    const maxOrder = await prisma.menuItem.aggregate({
      where: { restaurantId, categoryId },
      _max: { displayOrder: true }
    });

    const item = await prisma.menuItem.create({
      data: {
        restaurantId, categoryId, name, description, price, cost, image,
        available, dietary, eightySixed: false,
        displayOrder: (maxOrder._max.displayOrder || 0) + 1
      }
    });
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating menu item:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

router.patch('/:restaurantId/menu/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const {
      categoryId, name, description, price, cost, image,
      available, eightySixed, eightySixReason, popular, dietary, displayOrder
    } = req.body;

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(categoryId !== undefined && { categoryId }),
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price }),
        ...(cost !== undefined && { cost }),
        ...(image !== undefined && { image }),
        ...(available !== undefined && { available }),
        ...(eightySixed !== undefined && { eightySixed }),
        ...(eightySixReason !== undefined && { eightySixReason }),
        ...(popular !== undefined && { popular }),
        ...(dietary !== undefined && { dietary }),
        ...(displayOrder !== undefined && { displayOrder })
      }
    });
    res.json(item);
  } catch (error) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

router.patch('/:restaurantId/menu/items/:itemId/86', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const { eightySixed, reason } = req.body;

    const item = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        eightySixed,
        eightySixReason: eightySixed ? reason : null
      }
    });
    res.json(item);
  } catch (error) {
    console.error('Error toggling 86 status:', error);
    res.status(500).json({ error: 'Failed to update 86 status' });
  }
});

router.delete('/:restaurantId/menu/items/:itemId', async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    await prisma.menuItem.delete({ where: { id: itemId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ============ Orders ============

router.get('/:restaurantId/orders', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { status, limit = '50' } = req.query;

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(status && { status: status as string })
      },
      include: {
        orderItems: true,
        customer: true
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string)
    });
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/:restaurantId/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: { include: { menuItem: true } },
        customer: true
      }
    });

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

router.post('/:restaurantId/orders', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { customerInfo, orderType, items, specialInstructions, scheduledTime } = req.body;

    let customerId = null;
    if (customerInfo?.email || customerInfo?.phone) {
      const customer = await prisma.customer.create({
        data: {
          restaurantId,
          firstName: customerInfo.firstName,
          lastName: customerInfo.lastName,
          email: customerInfo.email,
          phone: customerInfo.phone
        }
      });
      customerId = customer.id;
    }

    let subtotal = 0;
    const orderItemsData = [];

    for (const item of items) {
      const menuItem = await prisma.menuItem.findUnique({
        where: { id: item.menuItemId }
      });

      if (!menuItem) {
        res.status(400).json({ error: `Menu item ${item.menuItemId} not found` });
        return;
      }

      if (menuItem.eightySixed) {
        res.status(400).json({ error: `${menuItem.name} is currently unavailable` });
        return;
      }

      const itemTotal = Number(menuItem.price) * item.quantity;
      subtotal += itemTotal;

      orderItemsData.push({
        menuItemId: menuItem.id,
        menuItemName: menuItem.name,
        quantity: item.quantity,
        unitPrice: menuItem.price,
        totalPrice: itemTotal,
        specialInstructions: item.specialInstructions
      });
    }

    const taxRate = 0.07;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const order = await prisma.order.create({
      data: {
        restaurantId,
        customerId,
        orderNumber: generateOrderNumber(),
        orderType,
        status: 'pending',
        subtotal,
        tax,
        total,
        specialInstructions,
        scheduledTime: scheduledTime ? new Date(scheduledTime) : null,
        orderItems: { create: orderItemsData }
      },
      include: { orderItems: true, customer: true }
    });

    if (customerId) {
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          totalOrders: { increment: 1 },
          totalSpent: { increment: total },
          lastOrderDate: new Date()
        }
      });
    }

    res.status(201).json(order);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

router.patch('/:restaurantId/orders/:orderId/status', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }

    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
      include: { orderItems: true, customer: true }
    });

    res.json(order);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

router.delete('/:restaurantId/orders/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } });
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

export default router;
