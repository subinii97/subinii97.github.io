---
title: "Posts"
layout: single
permalink: /posts/
author_profile: false
sidebar:
  nav: "posts"
classes: posts-cards
---

{% assign sections = "Travel,Transition,Diary,Study" | split: "," %}
{% assign limit_n = 5 %}

{% for cat in sections %}
## {{ cat }}

<ul>
  {% assign posts_in_cat = site.categories[cat] %}
  {% if posts_in_cat and posts_in_cat.size > 0 %}
    {% for post in posts_in_cat limit: limit_n %}
    <li>
      <a class="post-link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
      <span class="post-date">{{ post.date | date: "%Y-%m-%d" }}</span>
    </li>
    {% endfor %}
  {% else %}
    <li><em>No posts yet.</em></li>
  {% endif %}
</ul>

{% assign cat_page = site.pages | where: "taxonomy", cat | first %}
{% if cat_page %}
  <p><a class="pill-btn" href="{{ cat_page.url | relative_url }}">More →</a></p>
{% endif %}

{% endfor %}
