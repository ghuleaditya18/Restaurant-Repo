/**
 * Static Restaurant Information Configuration
 *
 * This configuration holds static display content for the Settings -> About section.
 * STRICT DATABASE SAFETY REQUIREMENT:
 * - This content is purely client-side presentation.
 * - No records are inserted into PostgreSQL.
 * - Unsupplied business contact/operational details default to "Not configured".
 */

export const RESTAURANT_ABOUT = {
  // 1. Restaurant Overview
  overview: {
    name: "Saffron Table",
    tagline: "Good Food, Great Moments.",
    cuisine: "Indian and Multi-Cuisine",
    type: "Casual Dining Restaurant",
    description:
      "Saffron Table is a welcoming dining destination bringing together familiar Indian flavours, carefully prepared dishes, and a comfortable atmosphere for families, friends, and everyday dining. Every dish is crafted with fresh ingredients, balanced spices, and a genuine passion for authentic taste.",
    establishedYear: "2021",
  },

  // 2. Our Story
  story: {
    title: "Our Story",
    subtitle: "From a shared family kitchen to a beloved community dining room",
    paragraphs: [
      "Saffron Table was founded with a straightforward and heartfelt vision: to celebrate the warmth, aroma, and richness of authentic regional recipes in an inviting, contemporary dining space where guests feel instantly at home.",
      "Recognizing that dining out is as much about shared memories as it is about exceptional food, our culinary journey began by standardizing traditional recipes with fresh, locally sourced spices and consistent cooking techniques. Over the years, we have grown from a modest neighbourhood eatery into a trusted destination for family celebrations, casual lunches, and memorable evening meals.",
      "Today, our dedicated kitchen and front-of-house teams continue to prioritize hospitality, uncompromising freshness, and friendly service with every guest we welcome through our doors.",
    ],
  },

  // 3. Meet the Founder
  founder: {
    title: "Meet the Founder",
    name: "Aarav Mehta",
    role: "Founder & Owner",
    image: "/assets/founder-aarav-mehta.jpg",
    bio: "A lifelong enthusiast of regional culinary heritage and hospitality, Aarav founded Saffron Table to bring together time-honoured culinary techniques with attentive guest service. Committed to pristine kitchen standards, fresh seasonal ingredients, and genuine customer care, Aarav guides the restaurant's daily vision to ensure every dining experience remains warm, flavourful, and memorable.",
    quote:
      "Great hospitality begins with respect for ingredients and genuine care for the people who sit at your table.",
  },
  // Alias for backward compatibility
  get owner() {
    return this.founder;
  },

  // 4. Our Food Philosophy
  philosophy: {
    title: "Our Food Philosophy",
    principles: [
      {
        title: "Fresh Preparation",
        description:
          "Dishes are prepared fresh to order in our kitchen, ensuring vibrant flavours, ideal temperatures, and wholesome nutrition.",
      },
      {
        title: "Quality Ingredients",
        description:
          "We source top-grade grains, fresh vegetables, unadulterated dairy, and aromatic whole spices for natural taste and purity.",
      },
      {
        title: "Consistent Taste",
        description:
          "Careful recipe standardization and meticulous seasoning ensure that your favourite dishes taste just as delightful on every visit.",
      },
      {
        title: "Hygiene & Clean Handling",
        description:
          "Our kitchen adheres to strict hygiene, sanitized prep stations, and responsible food safety standards at all times.",
      },
      {
        title: "Menu Variety",
        description:
          "Thoughtfully curated vegetarian and non-vegetarian selections accommodating diverse palate preferences and dietary needs.",
      },
      {
        title: "Guest Satisfaction",
        description:
          "Attentive presentation, custom spice preferences, and prompt service focused on making every meal enjoyable.",
      },
    ],
  },

  // 5. Our Specialities (Culinary categories)
  specialities: {
    title: "Our Culinary Highlights",
    subtitle: "Culinary categories celebrating our kitchen's diverse repertoire",
    categories: [
      {
        name: "Indian Main Course",
        tag: "Comfort & Gravies",
        description:
          "Rich slow-cooked gravies, aromatic paneer delicacies, and fragrant dals paired with artisanal flatbreads and steamed basmati rice.",
      },
      {
        name: "Starters & Appetizers",
        tag: "Crisp & Savoury",
        description:
          "Golden crisp fried treats, marinated cottage cheese bites, and zesty regional finger foods to whet your appetite.",
      },
      {
        name: "Tandoor Specialities",
        tag: "Clay Oven Roasted",
        description:
          "Smoky skewers, marinated paneer tikka, and freshly baked garlic naans straight from our charcoal-fired clay tandoor.",
      },
      {
        name: "Beverages & Refreshers",
        tag: "Cool & Traditional",
        description:
          "Chilled spiced buttermilk, thick sweet mango lassis, fresh lime coolers, and traditional hot masala chai.",
      },
      {
        name: "Desserts & Sweets",
        tag: "Sweet Finales",
        description:
          "Warm cardamom gulab jamuns, fragrant saffron rasmalai, and seasonal kulfis to conclude your meal on a sweet note.",
      },
    ],
  },

  // 6. Restaurant Details (Unconfigured details marked "Not configured")
  details: {
    title: "Restaurant Details",
    subtitle: "Official business and operational information",
    fields: [
      { label: "Restaurant Name", value: "Saffron Table", isConfigured: true },
      { label: "Restaurant Type", value: "Casual Dining Restaurant", isConfigured: true },
      { label: "Cuisine Category", value: "Indian and Multi-Cuisine", isConfigured: true },
      { label: "Address", value: "Not configured", isConfigured: false },
      { label: "Contact Number", value: "Not configured", isConfigured: false },
      { label: "Official Email", value: "Not configured", isConfigured: false },
      { label: "Opening Hours", value: "Not configured", isConfigured: false },
      { label: "Dining Services", value: "Dine-In (Reservations & Walk-ins)", isConfigured: true },
    ],
  },

  // 7. The Dining Experience
  experience: {
    title: "The Dining Experience",
    points: [
      {
        title: "Comfortable Environment",
        description:
          "A relaxed, welcoming ambience with ergonomic seating and warm illumination suited for both intimate meals and family gatherings.",
      },
      {
        title: "Family & Group Friendly",
        description:
          "Spacious multi-person dining tables designed to comfortably accommodate family dinners, team lunches, and casual celebrations.",
      },
      {
        title: "Attentive Customer Service",
        description:
          "Courteous waitstaff and responsive floor coordination ensuring smooth ordering, prompt table service, and timely billing.",
      },
      {
        title: "Order & Service Convenience",
        description:
          "Accurate table management, digital order tracking, seamless invoicing, and swift payment processing for guests.",
      },
    ],
  },
};
